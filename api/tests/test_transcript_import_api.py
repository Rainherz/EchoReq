"""Importar la transcripción por la API: una sola fuente de turnos por reunión.

Contra PostgreSQL de verdad, en la base descartable: la guarda que impide
una segunda fuente vive dentro de la transacción que escribe los turnos, y
`turns` es de solo anexado.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.adapters.persistence import pool
from app.main import app

TXT = (
    "[00:05] Entrevistador: ¿Qué le toma más tiempo?\n"
    "Director: Pasar las notas al Excel.\n"
    "Director: Y cuadrar horarios.\n"
    "Entrevistador: Gracias.\n"
).encode()


@pytest.fixture()
def meeting(scratch_db, tmp_path, monkeypatch):
    monkeypatch.setenv("ECHOREQ_TRANSCRIPT_DIR", str(tmp_path / "transcripts"))
    monkeypatch.setenv("ECHOREQ_AUDIO_DIR", str(tmp_path / "audio"))
    tag = f"t{uuid.uuid4().hex[:8]}"
    project, meeting_id, participant = f"{tag}-p", f"{tag}-r1", f"{tag}-ana"
    with pool.cursor() as cur:
        cur.execute("INSERT INTO projects (id, name) VALUES (%s, %s)", (project, tag))
        cur.execute(
            "INSERT INTO meetings (id, project_id, iteration, label, held_at, mode)"
            " VALUES (%s,%s,1,%s,%s,'discovery')",
            (meeting_id, project, meeting_id, datetime(2026, 1, 1, tzinfo=timezone.utc)),
        )
        cur.execute(
            "INSERT INTO participants (id, display_name, role) VALUES (%s,'Ana','analista')",
            (participant,),
        )
    with TestClient(app) as client:
        yield client, project, meeting_id, participant, tmp_path


def _upload(client, meeting_id, name="reunion.txt", body=TXT):
    return client.post(
        f"/api/meetings/{meeting_id}/transcript",
        files={"file": (name, body, "text/plain")},
    )


def test_importa_los_turnos_y_guarda_el_archivo_con_su_hash(meeting):
    client, project, meeting_id, participant, tmp_path = meeting
    assert client.post(f"/api/meetings/{meeting_id}/consent").status_code == 204

    response = _upload(client, meeting_id)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["format"] == "txt"
    assert body["turnCount"] == 3
    assert body["sha256"] == hashlib.sha256(TXT).hexdigest()

    turns = client.get(f"/api/meetings/{meeting_id}/turns").json()
    assert [(t["id"], t["speaker"]) for t in turns] == [
        (1, "Entrevistador"),
        (2, "Director"),
        (3, "Entrevistador"),
    ]
    assert turns[1]["text"] == "Pasar las notas al Excel. Y cuadrar horarios."

    stored = list((tmp_path / "transcripts").iterdir())
    assert [p.read_bytes() for p in stored] == [TXT]

    listed = client.get(
        f"/api/projects/{project}/meetings", params={"participant": participant}
    ).json()[0]
    assert listed["transcriptionStatus"] == "done"
    assert listed["transcriptFormat"] == "txt"
    assert listed["transcriptFilename"] == "reunion.txt"

    with pool.cursor() as cur:
        cur.execute(
            "SELECT transcription_model, transcript_sha256 FROM meetings WHERE id = %s",
            (meeting_id,),
        )
        row = cur.fetchone()
    # La procedencia dice que no hubo modelo: los turnos salieron de un archivo.
    assert row["transcription_model"] == "import"
    assert row["transcript_sha256"] == body["sha256"]


def test_una_segunda_importacion_se_rechaza(meeting):
    client, _, meeting_id, *_ = meeting
    client.post(f"/api/meetings/{meeting_id}/consent")
    assert _upload(client, meeting_id).status_code == 201

    again = _upload(client, meeting_id, body=b"A: otra.\nB: cosa.\n")
    assert again.status_code == 409
    assert "turnos" in again.json()["detail"]
    assert len(client.get(f"/api/meetings/{meeting_id}/turns").json()) == 3


def test_sin_consentimiento_se_rechaza(meeting):
    client, _, meeting_id, *_ = meeting
    response = _upload(client, meeting_id)
    assert response.status_code == 409
    assert "consentimiento" in response.json()["detail"]
    assert client.get(f"/api/meetings/{meeting_id}/turns").json() == []


def test_una_reunion_transcripta_del_audio_no_recibe_transcripcion(meeting):
    client, _, meeting_id, *_ = meeting
    client.post(f"/api/meetings/{meeting_id}/consent")
    with pool.cursor() as cur:
        cur.execute(
            "INSERT INTO turns (meeting_id, turn_id, speaker, starts_at, ends_at, text)"
            " VALUES (%s, 1, 'S1', '00:00', '00:04', 'hola')",
            (meeting_id,),
        )
        cur.execute(
            "UPDATE meetings SET transcription_status = 'done',"
            " transcription_model = 'large-v3' WHERE id = %s",
            (meeting_id,),
        )
    assert _upload(client, meeting_id).status_code == 409


def test_despues_de_importar_no_se_sube_audio(meeting):
    client, _, meeting_id, *_ = meeting
    client.post(f"/api/meetings/{meeting_id}/consent")
    _upload(client, meeting_id)

    response = client.post(
        f"/api/meetings/{meeting_id}/audio",
        files={"file": ("reunion.m4a", b"\x00" * 64, "audio/mp4")},
    )
    assert response.status_code == 409


def test_las_voces_de_una_transcripcion_sin_marcas_se_pueden_nombrar(meeting):
    client, _, meeting_id, *_ = meeting
    client.post(f"/api/meetings/{meeting_id}/consent")
    _upload(client, meeting_id, body=b"A: hola.\nB: buenas.\n")

    response = client.get(f"/api/meetings/{meeting_id}/speakers")
    assert response.status_code == 200, response.text
    assert sorted(v["code"] for v in response.json()) == ["A", "B"]


def test_formato_no_admitido_es_422(meeting):
    client, _, meeting_id, *_ = meeting
    client.post(f"/api/meetings/{meeting_id}/consent")
    assert _upload(client, meeting_id, name="reunion.docx").status_code == 422


def test_reunion_inexistente_es_404(meeting):
    client, *_ = meeting
    assert _upload(client, "no-existe-xyz").status_code == 404
