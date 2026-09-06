#!/usr/bin/env python
"""Recupera la huella de voz de una reunión ya transcripta.

    .venv-asr/bin/python voiceprints.py <meeting_id>

Para qué. Reconocer una voz entre reuniones exige tener guardado su centroide,
y las reuniones transcriptas antes de que eso existiera no lo tienen. Volver a
transcribirlas costaría el reconocimiento de voz entero; acá se corre sólo la
diarización, que es la mitad del trabajo, y los turnos no se tocan.

Cómo. La segunda diarización numera las voces por su cuenta, así que su
`SPEAKER_00` no tiene por qué ser el `S1` que ya está en la base. Se traduce
por solapamiento temporal contra los turnos guardados, que es lo único que las
dos pasadas comparten.
"""

from __future__ import annotations

import argparse

from app.adapters.persistence import transcript_store as store
from app.adapters.persistence.pool import close_pool
from app.adapters.transcription.local_engine import (
    LocalTranscriptionEngine,
    MissingToken,
    _load_waveform,
    _speaker_spans,
    _voiceprints,
)
from app.requirements.domain.transcription import match_codes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("meeting_id")
    args = parser.parse_args()

    try:
        audio = store.load(args.meeting_id)
    except LookupError as exc:
        print(exc)
        return 1

    if audio.path is None:
        print(f"La reunión {args.meeting_id} no tiene audio cargado.")
        return 1

    turnos = store.stored_turns(args.meeting_id)
    if not turnos:
        print(
            f"La reunión {args.meeting_id} no tiene turnos guardados.\n"
            "  Sin ellos no hay contra qué mapear las voces: transcribila "
            "primero."
        )
        return 1

    print(f"Reunión {audio.meeting_id} · {audio.label} · {len(turnos)} turnos")
    print(f"  códigos guardados: {', '.join(sorted({t.speaker for t in turnos}))}\n")

    try:
        engine = LocalTranscriptionEngine(
            on_stage=lambda stage: print(f"  {stage}", flush=True)
        )
    except MissingToken as exc:
        print(exc)
        return 1

    print("  Diarizando de nuevo (sin reconocimiento de voz)…", flush=True)
    salida = engine._pipeline()(_load_waveform(audio.path))

    mapeo = match_codes(_speaker_spans(salida), turnos)
    if not mapeo:
        print("\nNinguna voz de esta pasada se solapa con los turnos guardados.")
        return 1

    print("\n  etiqueta nueva -> código guardado")
    for etiqueta, codigo in sorted(mapeo.items()):
        print(f"    {etiqueta} -> {codigo}")

    huellas = _voiceprints(salida, mapeo)
    escritas = store.store_voiceprints(args.meeting_id, huellas)

    print(f"\n{escritas} huellas guardadas de {len(huellas)} voces mapeadas")
    if escritas < len(huellas):
        print("  (las demás ya estaban guardadas y no se pisan)")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    finally:
        close_pool()
