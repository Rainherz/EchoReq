#!/usr/bin/env python
"""Inyecta propuestas defectuosas en la cola de una iteración.

    .venv/bin/python inject.py <meeting_id> --project ID [--rate 0.25] [--seed N]

Para qué. El estudio mide si el revisor detecta cuándo el agente se equivoca.
Con propuestas observadas eso no se puede medir: si acepta todo, no hay forma
de distinguir que el agente estuvo bien de que el revisor no estaba mirando.
Plantar defectos conocidos da el denominador — de N sembrados, cuántos
pasaron — y registrar de qué tipo era cada uno permite decir algo más útil que
una tasa: no cuesta lo mismo ver una cita movida que una precisión inventada.

Qué hace. Toma una proporción de las propuestas ya generadas y las reemplaza
por una versión defectuosa de sí mismas, rotando entre los cuatro tipos. Se
reemplaza y no se agrega: dos propuestas casi iguales sobre el mismo requisito
delatarían el defecto por su forma antes que por su contenido.

Es determinista: la misma semilla produce la misma inyección.

ADVERTENCIA. Esto convierte una corrida observacional en un experimento. Hay
que declarar en el informe que la cola contenía propuestas fabricadas, cuántas
y de qué tipo; si no, alguien puede leer los resultados como si el agente
hubiera producido esos errores.
"""

from __future__ import annotations

import argparse
import random

from app.adapters.persistence import generation_store as store
from app.adapters.persistence.pool import close_pool
from app.requirements.domain import injection as inj

#: Orden de rotación. Se alternan para que el revisor no aprenda un patrón:
#: si todos los defectos fueran del mismo tipo, a la tercera iteración se
#: estaría midiendo aprendizaje y no vigilancia.
ROTATION = ("citation_drift", "invented_precision", "role_shift", "clause_collapse")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("meeting_id")
    parser.add_argument("--project", required=True)
    parser.add_argument(
        "--rate",
        type=float,
        default=0.25,
        help="Proporción de la cola que se vuelve defectuosa. Se fija antes de "
        "la corrida y no se cambia después de ver resultados.",
    )
    parser.add_argument("--seed", type=int, default=None, help="Semilla. Queda en el informe.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not 0 < args.rate <= 0.5:
        print("La proporción tiene que estar entre 0 y 0.5.")
        print("  Por encima de la mitad el revisor deja de creerle a la herramienta")
        print("  y se mide desconfianza en lugar de vigilancia.")
        return 1

    iteration, _mode, turns, _voces = store.load_meeting(args.project, args.meeting_id)
    propuestas = store.load_proposals(args.project, iteration)

    if not propuestas:
        print(f"La iteración {iteration} no tiene propuestas. Generá primero.")
        return 1

    if any(p.known_defective for p in propuestas):
        print(
            f"La iteración {iteration} ya tiene propuestas inyectadas.\n"
            "  Inyectar dos veces cambia la proporción sin que quede registro de\n"
            "  cuál era la planificada."
        )
        return 1

    if store.existing_decisions(args.project, iteration):
        print(
            f"La iteración {iteration} ya tiene decisiones registradas.\n"
            "  Alterar ahora la cola dejaría esas decisiones apuntando a un texto\n"
            "  que el revisor nunca vio."
        )
        return 1

    semilla = args.seed if args.seed is not None else random.randrange(10**6)
    rng = random.Random(semilla)

    cuantas = max(1, round(len(propuestas) * args.rate))
    pool = [t.turn_id for t in turns]
    roles = [s.role for p in propuestas if (s := inj.parse(p.content))]

    elegidas = rng.sample(propuestas, min(cuantas, len(propuestas)))
    restantes = [p for p in propuestas if p not in elegidas]

    print(
        f"Reunión {iteration} · {len(propuestas)} propuestas · "
        f"objetivo {cuantas} defectuosas ({args.rate:.0%}) · semilla {semilla}\n"
    )

    hechas: list[inj.Injected] = []
    for indice, propuesta in enumerate(elegidas):
        # Se rota el tipo y, si no aplica a esta propuesta, se prueban los
        # demás antes de rendirse: una historia mal formada no encaja en
        # todas las transformaciones.
        for salto in range(len(ROTATION)):
            kind = ROTATION[(indice + salto) % len(ROTATION)]
            hecho = _apply(kind, propuesta, restantes, pool, roles, rng)
            if hecho is not None:
                hechas.append(hecho)
                break
        else:
            print(f"  {propuesta.target_id}: ninguna transformación aplica, se deja intacta")

    for hecho in hechas:
        print(f"  {hecho.proposal.target_id}  {hecho.kind}")
        print(f"    {hecho.note}")
        print(f"    {(hecho.proposal.content or '')[:110]}")

    if args.dry_run:
        print("\n(--dry-run: no se guardó nada)")
        return 0

    for hecho in hechas:
        store.mark_defective(hecho.proposal, hecho.kind, hecho.note)

    print(f"\n{len(hechas)} de {len(propuestas)} propuestas quedaron defectuosas")
    print(
        "\nDeclaralo en el informe: proporción planificada, semilla y tipos.\n"
        "Sin eso, los resultados se leen como si el agente hubiera producido\n"
        "esos errores."
    )
    return 0


def _apply(kind, propuesta, restantes, pool, roles, rng) -> inj.Injected | None:
    if kind == "clause_collapse":
        return inj.clause_collapse(propuesta, rng.choice(restantes)) if restantes else None
    if kind == "citation_drift":
        return inj.citation_drift(propuesta, pool, rng)
    if kind == "invented_precision":
        return inj.invented_precision(propuesta, rng)
    return inj.role_shift(propuesta, roles, rng)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    finally:
        close_pool()
