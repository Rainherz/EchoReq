#!/usr/bin/env python
"""Transcribe el audio de una reunión y deja los turnos en la base.

    .venv-asr/bin/python transcribe.py <meeting_id> [--idioma es] [--modelo large-v3]

Corre con el entorno `.venv-asr`, no con el de la API: la pila de modelos pesa
cientos de megabytes y el servidor web no tiene por qué cargarla. Es un
proceso aparte también por tiempo — sin GPU, cuarenta minutos de audio son
decenas de minutos de trabajo, y eso no entra en una petición HTTP.

La interfaz no necesita saber que esto existe: lee `transcription_status` de
la base y muestra en qué anda.
"""

from __future__ import annotations

import argparse
import sys
import time

from app.adapters.persistence import transcript_store as store
from app.adapters.persistence.pool import close_pool
from app.adapters.transcription.local_engine import (
    DEFAULT_COMPUTE_TYPE,
    DEFAULT_MODEL,
    LocalTranscriptionEngine,
    MissingToken,
)
from app.requirements.transcribe import (
    NotTranscribable,
    ensure_transcribable,
    run_transcription,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("meeting_id")
    parser.add_argument(
        "--idioma",
        default="es",
        help="Idioma del audio. 'auto' deja que el modelo lo detecte.",
    )
    parser.add_argument("--modelo", default=DEFAULT_MODEL)
    parser.add_argument("--compute-type", default=DEFAULT_COMPUTE_TYPE)
    parser.add_argument(
        "--sin-diarizacion",
        action="store_true",
        help="Salta pyannote. Los turnos quedan sin atribuir a un hablante.",
    )
    args = parser.parse_args()

    try:
        audio = store.load(args.meeting_id)
    except LookupError as exc:
        print(exc)
        return 1

    print(f"Reunión {audio.meeting_id} · {audio.label}")
    print(f"  audio  {audio.path or '(sin cargar)'}")
    print(f"  estado {audio.status} · {audio.turn_count} turnos\n")

    try:
        ensure_transcribable(audio)
    except NotTranscribable as exc:
        print(exc)
        return 1

    try:
        engine = LocalTranscriptionEngine(
            model=args.modelo,
            compute_type=args.compute_type,
            diarize=not args.sin_diarizacion,
            on_stage=lambda stage: print(f"  {stage}", flush=True),
        )
    except MissingToken as exc:
        print(exc)
        return 1

    started = time.monotonic()
    try:
        result = run_transcription(
            engine,
            store,
            args.meeting_id,
            language=None if args.idioma == "auto" else args.idioma,
        )
    except NotTranscribable as exc:
        print(exc)
        return 1
    except Exception as exc:  # noqa: BLE001 — el motivo ya quedó en la base
        print(f"\nFalló la transcripción: {type(exc).__name__}: {exc}")
        print("El estado quedó en 'failed' con el motivo registrado.")
        return 1

    elapsed = time.monotonic() - started
    speakers = sorted({turn.speaker for turn in result.turns})

    print(
        f"\n{len(result.turns)} turnos · idioma {result.language} · "
        f"{len(speakers)} hablantes ({', '.join(speakers)}) · "
        f"{elapsed / 60:.1f} min"
    )
    print("\nPrimeros turnos:")
    for turn in result.turns[:5]:
        print(f"  [{turn.turn_id}] {turn.starts_at} {turn.speaker}: {turn.text[:80]}")

    print(
        "\nLos hablantes salieron como S1, S2… La diarización distingue voces, "
        "no personas:\nponerles nombre es decisión del analista."
    )
    print(f"\nSiguiente paso:\n  .venv/bin/python generate.py {args.meeting_id} "
          f"--project <id-del-proyecto>")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    finally:
        # Python 3.14 no permite unir hilos durante la finalización.
        close_pool()
