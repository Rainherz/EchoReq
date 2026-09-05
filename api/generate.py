#!/usr/bin/env python
"""Genera las propuestas de una reunión.

    .venv/bin/python generate.py <meeting_id> [--project ID] [--replay] [--dry-run]

``--replay`` relee la generación ya registrada en lugar de llamar al modelo:
misma salida, sin costo. Es la única reproducción exacta disponible, porque
los modelos actuales no aceptan `temperature`.

``--dry-run`` muestra qué se propondría sin escribir nada.
"""

from __future__ import annotations

import argparse
import sys

from app.adapters.llm.claude_engine import ClaudeProposalEngine, credentials_available
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
    args = parser.parse_args()

    iteration, mode, turns = store.load_meeting(args.project, args.meeting_id)
    if not turns:
        print(f"La reunión {args.meeting_id} no tiene turnos cargados.")
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
    )

    if args.replay:
        engine = ReplayProposalEngine()
    else:
        if not credentials_available():
            print(
                "No se encontraron credenciales de Anthropic.\n"
                "  Exportá ANTHROPIC_API_KEY, o corré con --replay para releer\n"
                "  una generación ya registrada."
            )
            return 1
        engine = ClaudeProposalEngine()

    print(
        f"Reunión {iteration} · modo {mode} · {len(turns)} turnos · "
        f"{len(baseline)} requisitos vigentes"
    )
    print("Releyendo lo registrado…" if args.replay else "Generando…")

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

    if not args.replay:
        call_id = store.record_call(
            args.project, args.meeting_id, iteration, outcome.result
        )
        print(f"\nllamada registrada · llm_calls #{call_id}")

    stored = store.store_proposals(outcome.accepted)
    print(f"{stored} propuestas guardadas en la cola de la iteración {iteration}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    finally:
        # Python 3.14 no permite unir hilos durante la finalización.
        close_pool()
