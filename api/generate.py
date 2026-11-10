#!/usr/bin/env python
"""Genera las propuestas de una reunión.

    .venv/bin/python generate.py <meeting_id> [--project ID] [--replay] [--dry-run]

``--replay`` relee la generación ya registrada en lugar de llamar al modelo:
misma salida, sin costo. Es la única reproducción exacta disponible, porque
los modelos actuales no aceptan `temperature`.

``--dry-run`` muestra qué se propondría sin escribir nada.

``--engine gemini`` genera con el nivel gratuito de Google AI Studio en lugar
de la API de Anthropic. Es una sustitución declarada: el modelo queda
registrado en ``llm_calls`` con su identificador real. Una cadena que se mide
tiene que usar un solo motor de punta a punta — cambiarlo entre iteraciones
mete la deriva del modelo dentro de la que se estudia.
"""

from __future__ import annotations

import argparse
import sys

from app.adapters.llm.claude_engine import ClaudeProposalEngine
from app.adapters.llm.claude_engine import credentials_available as anthropic_ready
from app.adapters.llm.gemini_engine import DEFAULT_MODEL as gemini_default_model
from app.adapters.llm.gemini_engine import GeminiProposalEngine
from app.adapters.llm.gemini_engine import credentials_available as google_ready
from app.adapters.llm.replay_engine import MissingRecording, ReplayProposalEngine
from app.adapters.persistence import generation_store as store
from app.adapters.persistence.pool import close_pool
from app.requirements.domain.generation import GenerationRequest
from app.requirements.generate import generate_proposals


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("meeting_id")
    parser.add_argument("--project", default="clinica-norte")
    parser.add_argument(
        "--replay",
        action="store_true",
        help="Relee la generación registrada en lugar de llamar al modelo.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Muestra el resultado sin guardar nada.",
    )
    parser.add_argument(
        "--modelo",
        default=None,
        help="Modelo del motor elegido. Se fija para toda la cadena y queda "
        "registrado en llm_calls.",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Descarta la cola de la iteración y la vuelve a generar.",
    )
    parser.add_argument(
        "--engine",
        choices=("claude", "gemini"),
        default="claude",
        help="Motor de generación. El elegido queda registrado en llm_calls.",
    )
    args = parser.parse_args()

    iteration, mode, turns, voices = store.load_meeting(args.project, args.meeting_id)
    if not turns:
        print(f"La reunión {args.meeting_id} no tiene turnos cargados.")
        return 1

    existing = store.existing_proposals(args.project, iteration)
    if existing and not args.replace and not args.dry_run:
        print(
            f"La iteración {iteration} ya tiene {existing} propuestas en la cola.\n"
            "  Los identificadores se derivan de la posición, así que generar de\n"
            "  nuevo no reemplazaría nada: las nuevas chocarían con las viejas y\n"
            "  se descartarían en silencio.\n"
            "  Usá --replace para descartar la cola y volver a generarla, o\n"
            "  --dry-run para ver qué propondría sin tocar nada."
        )
        return 1

    baseline = (
        [] if mode == "discovery" else store.load_baseline(args.project, iteration - 1)
    )

    request = GenerationRequest(
        project_id=args.project,
        meeting_id=args.meeting_id,
        iteration=iteration,
        mode=mode,  # type: ignore[arg-type]
        turns=turns,
        baseline=baseline,
        speakers=voices,
    )

    if args.replay:
        engine = ReplayProposalEngine()
    elif args.engine == "gemini":
        if not google_ready():
            print(
                "No se encontró la clave de Google AI Studio.\n"
                "  Sacá una gratis en aistudio.google.com/apikey y exportala\n"
                "  como GEMINI_API_KEY."
            )
            return 1
        engine = GeminiProposalEngine(
            on_wait=lambda m: print(f"  {m}", flush=True),
            model=args.modelo or gemini_default_model,
        )
    else:
        if not anthropic_ready():
            print(
                "No se encontraron credenciales de Anthropic.\n"
                "  Exportá ANTHROPIC_API_KEY, corré con --engine gemini para\n"
                "  usar el nivel gratuito de Google, o con --replay para releer\n"
                "  una generación ya registrada."
            )
            return 1
        engine = ClaudeProposalEngine()

    print(
        f"Reunión {iteration} · modo {mode} · {len(turns)} turnos · "
        f"{len(baseline)} requisitos vigentes"
    )
    if voices:
        print(f"  voces identificadas: {', '.join(sorted(voices.values()))}")
    else:
        print(
            "  voces sin identificar: el agente no va a poder distinguir quién\n"
            "  pide de quién pregunta. Etiquetalas en la pantalla de Sesiones."
        )
    print(
        "Releyendo lo registrado…"
        if args.replay
        else f"Generando con {args.engine}…"
    )

    try:
        outcome = generate_proposals(engine, request)
    except MissingRecording as exc:
        print(exc)
        return 1

    print(f"\n{outcome.summary}\n")

    for proposal in outcome.accepted:
        print(f"  {proposal.operation:9} {proposal.target_id:6} turnos {proposal.source_turn_ids}")
        if proposal.content:
            print(f"    {proposal.content[:96]}")
        for signal in proposal.signals:
            print(f"    ! {signal.label}: {signal.detail[:80]}")

    if outcome.rejected:
        print("\nDescartadas antes de la revisión:")
        for item in outcome.rejected:
            print(f"  {item.draft.operation} {item.draft.target_id} — {item.reason}")

    if args.dry_run:
        print("\n(--dry-run: no se guardó nada)")
        return 0

    # El descarte va acá y no antes de generar a propósito: si el modelo falla
    # —y falla, la corrida anterior murió con un 500 del proveedor— la cola
    # vieja tiene que seguir en pie. Quedarse sin propuestas por un error
    # transitorio del otro lado sería el peor momento para perderlas.
    if args.replace:
        try:
            discarded = store.discard_proposals(args.project, iteration)
        except store.Decided as exc:
            print(f"\n{exc}")
            return 1
        print(f"\n{discarded} propuestas anteriores descartadas")

    if not args.replay:
        call_id = store.record_call(
            args.project, args.meeting_id, iteration, outcome.result
        )
        print(f"\nllamada registrada · llm_calls #{call_id}")

    stored = store.store_proposals(outcome.accepted)
    print(f"{stored} propuestas guardadas en la cola de la iteración {iteration}")
    # Una propuesta admitida que no entra choca con un identificador que ya
    # existe. Antes eso pasaba en silencio; ahora la corrida lo dice.
    lost = len(outcome.accepted) - stored
    if lost:
        print(
            f"AVISO: {lost} de {len(outcome.accepted)} propuestas admitidas no se "
            "guardaron porque su identificador ya existía. ¿Ya se había generado "
            "esta reunión? Para reemplazar la cola, usá --replace."
        )
        return 1
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    finally:
        # Python 3.14 no permite unir hilos durante la finalización.
        close_pool()
