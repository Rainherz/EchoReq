"""Importar la transcripción de una reunión: la alternativa al audio.

Las mismas reglas que transcribir (`transcribe.py`), del otro lado: una
reunión toma sus turnos de una sola fuente, una sola vez, y con
consentimiento registrado. La API y `import_transcript.py` pasan por acá.
"""

from __future__ import annotations

from dataclasses import dataclass

from .domain import transcript_import as ti
from .domain.transcript_import import NotImportable, ParsedTurn


@dataclass(frozen=True, slots=True)
class ImportedTranscript:
    filename: str
    format: str
    sha256: str
    turns: list[ParsedTurn]

    @property
    def turn_count(self) -> int:
        return len(self.turns)

    @property
    def speakers(self) -> list[str]:
        return sorted({t.speaker for t in self.turns})


def ensure_importable(meeting) -> None:
    """Verifica que la reunión pueda recibir una transcripción.

    Se expone aparte para que la consola pueda preguntarlo antes de leer el
    archivo, igual que `ensure_transcribable` antes de cargar los modelos.
    """
    if not meeting.has_consent:
        raise NotImportable(
            "Registrá el consentimiento antes de cargar la transcripción: "
            "sin él no se procesa la sesión."
        )

    if meeting.turn_count > 0:
        raise NotImportable(
            f"La reunión {meeting.meeting_id} ya tiene {meeting.turn_count} turnos. "
            "Los turnos no se reemplazan ni se suman de otra fuente: las "
            "decisiones ya registradas los citan por número. Si la "
            "transcripción estaba mal, creá otra reunión."
        )

    if meeting.status == "running":
        raise NotImportable(
            f"La reunión {meeting.meeting_id} se está transcribiendo desde el audio."
        )

    if meeting.path is not None:
        raise NotImportable(
            f"La reunión {meeting.meeting_id} ya tiene audio: sus turnos salen de "
            "transcribirlo. El audio y la transcripción son alternativas; para "
            "usar un archivo de texto, creá otra reunión."
        )


def parse_file(filename: str, raw: bytes) -> tuple[str, list[ParsedTurn]]:
    """Formato y turnos del archivo, sin tocar nada. Falla con `TranscriptError`."""
    kind = ti.kind_for(filename)
    return kind, ti.parse(ti.decode(raw), kind)


def run_import(store, files, meeting_id: str, filename: str, raw: bytes) -> ImportedTranscript:
    """Lee el archivo, lo guarda con su hash y escribe los turnos.

    El orden importa: primero las reglas y el parseo, que no escriben nada;
    después el archivo; al final los turnos, en una transacción que vuelve a
    verificar que la reunión siga sin turnos.
    """
    ensure_importable(store.load(meeting_id))
    kind, turns = parse_file(filename, raw)

    stored = files.store(meeting_id, filename, raw)
    store.store_imported_turns(meeting_id, turns, stored, kind)
    return ImportedTranscript(
        filename=stored.filename, format=kind, sha256=stored.sha256, turns=turns
    )
