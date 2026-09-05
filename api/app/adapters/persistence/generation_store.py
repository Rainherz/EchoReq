"""Persistencia de una generación: la llamada y sus propuestas."""

from __future__ import annotations

import json

from ...requirements.domain.entities import ChangeProposal, Turn
from ...requirements.domain.generation import GenerationResult
from .pool import cursor

STAGE = "propose"


def load_meeting(project_id: str, meeting_id: str) -> tuple[int, str, list[Turn]]:
    """Iteración, modo y turnos de una reunión."""
    with cursor() as cur:
        cur.execute(
            "SELECT iteration, mode FROM meetings WHERE id = %s AND project_id = %s",
            (meeting_id, project_id),
        )
        meeting = cur.fetchone()
        if meeting is None:
            raise LookupError(f"No existe la reunión {meeting_id} en {project_id}.")

        cur.execute(
            """
            SELECT meeting_id, turn_id, speaker, starts_at, text
            FROM turns WHERE meeting_id = %s ORDER BY turn_id
            """,
            (meeting_id,),
        )
        turns = [Turn(**row) for row in cur.fetchall()]

    return meeting["iteration"], meeting["mode"], turns


def load_baseline(project_id: str, up_to_revision: int) -> list[tuple[str, str]]:
    """Especificación vigente al cierre de una revisión."""
    with cursor() as cur:
        cur.execute(
            """
            WITH history AS (
                SELECT requirement_id, content, operation,
                       ROW_NUMBER() OVER (
                           PARTITION BY requirement_id ORDER BY revision DESC
                       ) AS recency
                FROM requirement_revisions
                WHERE project_id = %s AND revision <= %s
            )
            SELECT requirement_id, content FROM history
            WHERE recency = 1 AND operation <> 'delete'
            ORDER BY requirement_id
            """,
            (project_id, up_to_revision),
        )
        return [(row["requirement_id"], row["content"]) for row in cur.fetchall()]


def record_call(
    project_id: str, meeting_id: str, iteration: int, result: GenerationResult
) -> int:
    """Anexa la llamada al registro de auditoría.

    Se guarda siempre, aunque después ninguna propuesta supere la validación:
    una generación que produjo puras citas inventadas es exactamente el dato
    que el estudio quiere poder mirar.
    """
    with cursor() as cur:
        cur.execute(
            """
            INSERT INTO llm_calls
                (project_id, meeting_id, iteration, stage, model_id, params,
                 prompt, response, input_tokens, output_tokens)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                project_id,
                meeting_id,
                iteration,
                STAGE,
                result.model_id,
                json.dumps(result.params),
                result.prompt,
                result.response,
                result.input_tokens,
                result.output_tokens,
            ),
        )
        return cur.fetchone()["id"]


def store_proposals(proposals: list[ChangeProposal]) -> int:
    """Guarda las propuestas admitidas. Devuelve cuántas se insertaron."""
    if not proposals:
        return 0

    with cursor() as cur:
        cur.executemany(
            """
            INSERT INTO change_proposals
                (id, project_id, meeting_id, iteration, operation, target_id,
                 previous_content, content, source_turn_ids, rationale,
                 signals, theme)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING
            """,
            [
                (
                    p.id,
                    p.project_id,
                    p.meeting_id,
                    p.iteration,
                    p.operation,
                    p.target_id,
                    p.previous_content,
                    p.content,
                    p.source_turn_ids,
                    p.rationale,
                    json.dumps(
                        [
                            {"rule": s.rule, "label": s.label, "detail": s.detail}
                            for s in p.signals
                        ]
                    ),
                    p.theme,
                )
                for p in proposals
            ],
        )
        return cur.rowcount
