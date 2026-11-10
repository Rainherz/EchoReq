#!/usr/bin/env python
"""Arma la plantilla de codificación ciega a partir de lo que generó el agente.

    cd api && .venv/bin/python ../experimento/plantilla.py [--semilla 2026]

Salida en experimento/codificacion/:

``plantilla.csv``  Una fila por propuesta, **barajada y sin la condición**: quien
                   codifica no sabe si la propuesta salió de la entrevista
                   estructurada o de la otra. Cada codificador la copia como
                   ``codificacion_A.csv`` / ``codificacion_B.csv`` y completa:
                     - ``necesidad``: N01…N18 de verdad_de_campo.csv, o NINGUNA
                     - ``cita_sostiene``: S si los turnos citados sostienen el
                       requisito, N si no
``clave.csv``      Qué ítem corresponde a qué proyecto, condición y corrida. No
                   se abre hasta terminar de codificar.

Las columnas automáticas (responsabilidades, forma, términos vagos) usan las
mismas funciones que EchoReq; no se reimplementan.
"""

from __future__ import annotations

import argparse
import csv
import random
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "api"))

from app.adapters.persistence.pool import close_pool, cursor  # noqa: E402
from app.requirements.domain.rules import (  # noqa: E402
    estimate_responsibilities,
    is_well_formed,
)

NUMERO = re.compile(
    r"\d|\b(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|mismo día|"
    r"día siguiente)\b",
    re.I,
)


def lexico() -> list[str]:
    lines = (HERE / "lexico_vago.txt").read_text(encoding="utf-8").splitlines()
    return [l.strip().lower() for l in lines if l.strip() and not l.startswith("#")]


def vagos(texto: str, terms: list[str]) -> list[str]:
    low = texto.lower()
    return [t for t in terms if re.search(rf"(?<!\w){re.escape(t)}(?!\w)", low)]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--semilla", type=int, default=2026)
    ap.add_argument("--prefijo", default="exp-", help="Proyectos a incluir.")
    args = ap.parse_args()

    terms = lexico()
    with cursor() as cur:
        cur.execute(
            """
            SELECT p.id, p.project_id, p.meeting_id, p.content, p.source_turn_ids,
                   p.signals, p.operation
            FROM change_proposals p
            WHERE p.project_id LIKE %s
            ORDER BY p.project_id, p.id
            """,
            (args.prefijo + "%",),
        )
        props = cur.fetchall()
        cur.execute(
            "SELECT meeting_id, turn_id, speaker, text FROM turns "
            "WHERE meeting_id IN (SELECT id FROM meetings WHERE project_id LIKE %s)",
            (args.prefijo + "%",),
        )
        turns = {(r["meeting_id"], r["turn_id"]): r for r in cur.fetchall()}

    if not props:
        print("No hay propuestas en los proyectos del experimento. ¿Corriste generate.py?")
        return 1

    rows, key = [], []
    for p in props:
        m = re.match(r"exp-(e|ne)-(\d+)$", p["project_id"])
        if not m:
            continue
        content = p["content"] or ""
        cited = "\n".join(
            f"[{t}] {turns[(p['meeting_id'], t)]['speaker']}: {turns[(p['meeting_id'], t)]['text']}"
            for t in p["source_turn_ids"] if (p["meeting_id"], t) in turns
        )
        hits = vagos(content, terms)
        rows.append({
            "item": "",
            "propuesta": content,
            "turnos_citados": ";".join(map(str, p["source_turn_ids"])),
            "texto_turnos_citados": cited,
            "necesidad": "",
            "cita_sostiene": "",
            "notas": "",
        })
        key.append({
            "item": "",
            "proyecto": p["project_id"],
            "condicion": m[1].upper(),
            "corrida": int(m[2]),
            "propuesta_id": p["id"],
            "operacion": p["operation"],
            "responsabilidades": estimate_responsibilities(content) if content else 0,
            "bien_formada": int(is_well_formed(content)) if content else 0,
            "terminos_vagos": ";".join(hits),
            "ambigua_auto": int(bool(hits) and not NUMERO.search(content)),
            "senal_ambiguedad_agente": sum(
                1 for s in (p["signals"] or []) if s.get("rule") == "unambiguous"
            ),
        })

    order = list(range(len(rows)))
    random.Random(args.semilla).shuffle(order)
    out = HERE / "codificacion"
    out.mkdir(exist_ok=True)
    with (out / "plantilla.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        for n, i in enumerate(order, 1):
            rows[i]["item"] = key[i]["item"] = f"I{n:03d}"
            w.writerow(rows[i])
    with (out / "clave.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(key[0]))
        w.writeheader()
        w.writerows(sorted(key, key=lambda k: k["item"]))

    print(f"{len(rows)} propuestas · semilla {args.semilla}")
    print(f"  {out / 'plantilla.csv'}  → copiar como codificacion_A.csv y codificacion_B.csv")
    print(f"  {out / 'clave.csv'}      → no abrir hasta terminar de codificar")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    finally:
        close_pool()
