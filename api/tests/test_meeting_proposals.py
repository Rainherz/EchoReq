"""Vista de la traza de una reunión: qué propuso el agente y qué decidió cada uno.

Corre contra PostgreSQL de verdad porque la consulta es SQL y un doble en
memoria no la ejercitaría. Usa una base descartable creada con las migraciones:
`review_decisions` es de solo anexado y no admite borrado, así que sembrar
filas de prueba en la base de desarrollo las dejaría ahí para siempre.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.adapters.persistence import pool
from app.main import app


@pytest.fixture()
def trace(scratch_db):
    tag = f"t{uuid.uuid4().hex[:8]}"
    project, meeting, empty_meeting = f"{tag}-p", f"{tag}-r1", f"{tag}-r2"
    ana, beto = f"{tag}-ana", f"{tag}-beto"
    held = datetime(2026, 1, 1, tzinfo=timezone.utc)
    shown = datetime(2026, 1, 2, 10, 0, 0, tzinfo=timezone.utc)

    with pool.cursor() as cur:
        cur.execute("INSERT INTO projects (id, name) VALUES (%s, %s)", (project, tag))
        for it, mid in ((1, meeting), (2, empty_meeting)):
            cur.execute(
                "INSERT INTO meetings (id, project_id, iteration, label, held_at, mode)"
                " VALUES (%s,%s,%s,%s,%s,'living')",
                (mid, project, it, mid, held),
            )
        for pid, name in ((ana, "Ana"), (beto, "Beto")):
            cur.execute(
                "INSERT INTO participants (id, display_name, role) VALUES (%s,%s,'analista')",
                (pid, name),
            )
        # p2 es de iteración 1 pero se inserta primero: el orden lo da la
        # iteración y después el id, no el de inserción.
        for pid, op, prev, content, turns, defective in (
            (f"{tag}-b", "modify", "viejo", "nuevo", [3, 4], True),
            (f"{tag}-a", "create", None, "texto", [1, 2], False),
        ):
            cur.execute(
                "INSERT INTO change_proposals (id, project_id, meeting_id, iteration,"
                " operation, target_id, previous_content, content, source_turn_ids,"
                " rationale, known_defective, defect_kind)"
                " VALUES (%s,%s,%s,1,%s,'R-01',%s,%s,%s,'porque',%s,%s)",
                (pid, project, meeting, op, prev, content, turns, defective,
                 'role_shift' if defective else None),
            )
        for who, action, edited, secs in (
            (ana, "accept", None, 5),
            (beto, "edit", "otro", 12),
        ):
            cur.execute(
                "INSERT INTO review_decisions (proposal_id, participant_id, action,"
                " presented_at, decided_at, edited_content) VALUES (%s,%s,%s,%s,%s,%s)",
                (f"{tag}-b", who, action, shown, shown + timedelta(seconds=secs), edited),
            )

    with TestClient(app) as client:
        yield client, meeting, empty_meeting, tag


def test_proposals_carry_citations_and_decisions(trace):
    client, meeting, _, tag = trace
    body = client.get(f"/api/meetings/{meeting}/proposals").json()

    assert [p["id"] for p in body] == [f"{tag}-a", f"{tag}-b"]
    decided = body[1]
    assert decided["sourceTurnIds"] == [3, 4]
    assert decided["previousContent"] == "viejo"
    assert decided["operation"] == "modify"
    by_person = {d["participantId"]: d for d in decided["decisions"]}
    assert by_person[f"{tag}-ana"]["action"] == "accept"
    assert by_person[f"{tag}-ana"]["participantName"] == "Ana"
    assert by_person[f"{tag}-ana"]["seconds"] == 5
    assert by_person[f"{tag}-beto"]["action"] == "edit"
    assert by_person[f"{tag}-beto"]["editedContent"] == "otro"
    assert by_person[f"{tag}-beto"]["seconds"] == 12


def test_proposal_without_decisions_has_empty_list(trace):
    client, meeting, _, tag = trace
    body = client.get(f"/api/meetings/{meeting}/proposals").json()
    assert body[0]["id"] == f"{tag}-a"
    assert body[0]["decisions"] == []


def test_blind_review_fields_are_not_exposed(trace):
    client, meeting, _, _ = trace
    for item in client.get(f"/api/meetings/{meeting}/proposals").json():
        assert "knownDefective" not in item
        assert "defectKind" not in item


def test_existing_meeting_without_proposals_is_empty_not_404(trace):
    client, _, empty_meeting, _ = trace
    response = client.get(f"/api/meetings/{empty_meeting}/proposals")
    assert response.status_code == 200
    assert response.json() == []


def test_unknown_meeting_is_404(trace):
    client, *_ = trace
    assert client.get("/api/meetings/no-existe-xyz/proposals").status_code == 404
