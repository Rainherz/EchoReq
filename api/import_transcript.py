#!/usr/bin/env python
"""Carga la transcripción de una reunión desde un .txt o .vtt.

    .venv/bin/python import_transcript.py <meeting_id> <archivo> [--consent] [--dry-run]

Es la alternativa a `transcribe.py`: los turnos salen del archivo en lugar
del audio. Hace lo mismo que subirlo en la pantalla de Captura —mismo parser,
mismas reglas: consentimiento previo, una sola fuente y una sola carga por
reunión—.

``--consent`` registra el consentimiento antes de importar. Usalo solo si los
participantes realmente lo dieron: queda en la base con la fecha de hoy.

``--dry-run`` muestra los turnos que saldrían, sin escribir nada.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from app.adapters.persistence import transcript_store as store
from app.adapters.persistence.pool import close_pool
from app.adapters.persistence.repositories import PostgresMeetingRepository
from app.adapters.storage import transcript as files
from app.requirements.domain.transcript_import import NotImportable, TranscriptError
from app.requirements.import_transcript import parse_file, run_import


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("meeting_id")
    parser.add_argument("archivo", type=Path)
    parser.add_argument("--consent", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    raw = args.archivo.read_bytes()
    try:
        kind, turns = parse_file(args.archivo.name, raw)
    except TranscriptError as exc:
        print(f"No se pudo leer {args.archivo.name}: {exc}")
        return 1

    speakers = sorted({t.speaker for t in turns})
    print(f"{args.archivo.name} · {kind} · {len(turns)} turnos · hablantes: {', '.join(speakers)}")
    for t in turns[:5]:
        print(f"  {t.turn_id:>3} {t.speaker:<15} {t.starts_at:>8}  {t.text[:70]}")
    if len(turns) > 5:
        print(f"  … y {len(turns) - 5} más")

    if args.dry_run:
        print("\n(--dry-run: no se guardó nada)")
        return 0

    try:
        if args.consent:
            PostgresMeetingRepository().record_consent(args.meeting_id)
        imported = run_import(store, files, args.meeting_id, args.archivo.name, raw)
    except (LookupError, NotImportable) as exc:
        print(f"\n{exc}")
        return 1

    print(f"\n{imported.turn_count} turnos guardados en {args.meeting_id} · sha256 {imported.sha256}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    finally:
        close_pool()
