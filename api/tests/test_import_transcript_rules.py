"""Reglas de la importación: una sola fuente de turnos por reunión.

Con dobles en memoria: lo que se prueba es la regla, no el SQL. La guarda
dentro de la transacción la ejercita `test_transcript_import_api.py`.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import pytest

from app.requirements.domain.transcript_import import NotImportable, TranscriptError
from app.requirements.import_transcript import run_import

TXT = b"Entrevistador: Hola.\nDirector: Buenas tardes.\n"


@dataclass
class FakeMeeting:
    meeting_id: str = "p-r1"
    label: str = "r1"
    path: str | None = None
    sha256: str | None = None
    status: str = "pending"
    turn_count: int = 0
    has_consent: bool = True
    transcript_format: str | None = None


@dataclass
class FakeStore:
    meeting: FakeMeeting
    stored: list = field(default_factory=list)

    def load(self, meeting_id):
        return self.meeting

    def store_imported_turns(self, meeting_id, turns, transcript, fmt):
        self.stored.append((meeting_id, turns, transcript, fmt))
        return len(turns)


@dataclass
class FakeFiles:
    written: list = field(default_factory=list)

    def store(self, meeting_id, filename, raw):
        from app.adapters.storage.transcript import StoredTranscript

        self.written.append((meeting_id, filename, raw))
        return StoredTranscript(
            filename=filename, path=f"/tmp/{meeting_id}.txt", sha256="a" * 64
        )


def test_importa_y_registra_que_la_fuente_es_un_archivo():
    store, files = FakeStore(FakeMeeting()), FakeFiles()
    result = run_import(store, files, "p-r1", "reunion.txt", TXT)

    assert result.format == "txt"
    assert result.turn_count == 2
    assert result.speakers == ["Director", "Entrevistador"]
    meeting_id, turns, transcript, fmt = store.stored[0]
    assert (meeting_id, fmt, transcript.filename) == ("p-r1", "txt", "reunion.txt")
    assert [t.turn_id for t in turns] == [1, 2]
    # El archivo se guarda tal cual llegó: el hash es de esos bytes.
    assert files.written == [("p-r1", "reunion.txt", TXT)]


def test_sin_consentimiento_no_se_importa():
    store, files = FakeStore(FakeMeeting(has_consent=False)), FakeFiles()
    with pytest.raises(NotImportable, match="consentimiento"):
        run_import(store, files, "p-r1", "reunion.txt", TXT)
    assert store.stored == [] and files.written == []


def test_una_reunion_con_turnos_no_recibe_otra_fuente():
    store, files = FakeStore(FakeMeeting(turn_count=12, status="done")), FakeFiles()
    with pytest.raises(NotImportable, match="ya tiene 12 turnos"):
        run_import(store, files, "p-r1", "reunion.txt", TXT)
    assert store.stored == [] and files.written == []


def test_una_reunion_con_audio_no_recibe_transcripcion():
    meeting = FakeMeeting(path="/audio/p-r1.m4a", sha256="b" * 64)
    store, files = FakeStore(meeting), FakeFiles()
    with pytest.raises(NotImportable, match="audio"):
        run_import(store, files, "p-r1", "reunion.txt", TXT)
    assert store.stored == []


def test_un_archivo_que_no_se_puede_leer_no_deja_nada():
    store, files = FakeStore(FakeMeeting()), FakeFiles()
    with pytest.raises(TranscriptError):
        run_import(store, files, "p-r1", "reunion.txt", b"A: solo yo.\n")
    assert store.stored == [] and files.written == []
