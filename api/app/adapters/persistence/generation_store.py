"""Persistencia de una generación: la llamada y sus propuestas."""

from __future__ import annotations

import json

from ...requirements.domain.entities import ChangeProposal, Turn
from ...requirements.domain.generation import GenerationResult
from . import speakers
from .pool import cursor

STAGE = "propose"


def load_meeting(
    project_id: str, meeting_id: str
) -> tuple[int, str, list[Turn], dict[str, str]]:
    """Iteración, modo, turnos y quién es cada voz."""
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

    return meeting["iteration"], meeting["mode"], turns, speakers.labels_for(meeting_id)


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


class Decided(Exception):
    """La iteración ya tiene decisiones registradas sobre sus propuestas."""


def existing_proposals(project_id: str, iteration: int) -> int:
    with cursor() as cur:
        cur.execute(
            "SELECT count(*) AS n FROM change_proposals "
            "WHERE project_id = %s AND iteration = %s",
            (project_id, iteration),
        )
        return cur.fetchone()["n"]


def existing_decisions(project_id: str, iteration: int) -> int:
    with cursor() as cur:
        cur.execute(
            """
            SELECT count(*) AS n
            FROM review_decisions d
            JOIN change_proposals p ON p.id = d.proposal_id
            WHERE p.project_id = %s AND p.iteration = %s
            """,
            (project_id, iteration),
        )
        return cur.fetchone()["n"]


def discard_proposals(project_id: str, iteration: int) -> int:
    """Borra la cola de una iteración para poder regenerarla.

    Se niega si alguna propuesta ya fue decidida. Una decisión mide lo que el
    revisor vio; si el texto que vio desaparece y otro ocupa su lugar, el
    intervalo registrado queda apuntando a algo que nunca se le mostró, y nada
    en la base delataría la sustitución.

    La llamada al modelo que produjo las propuestas viejas no se toca:
    `llm_calls` es de solo anexado y conserva el prompt y la respuesta.
    """
    with cursor() as cur:
        cur.execute(
            """
            SELECT count(*) AS n
            FROM review_decisions d
            JOIN change_proposals p ON p.id = d.proposal_id
            WHERE p.project_id = %s AND p.iteration = %s
            """,
            (project_id, iteration),
        )
        decided = cur.fetchone()["n"]
        if decided:
            raise Decided(
                f"La iteración {iteration} tiene {decided} decisiones "
                "registradas. Regenerarla dejaría esas decisiones apuntando a "
                "propuestas que el revisor nunca vio."
            )

        cur.execute(
            "DELETE FROM change_proposals WHERE project_id = %s AND iteration = %s",
            (project_id, iteration),
        )
        return cur.rowcount


def load_proposals(project_id: str, iteration: int) -> list[ChangeProposal]:
    """Las propuestas de una iteración, para poder alterarlas."""
    with cursor() as cur:
        cur.execute(
            """
            SELECT id, project_id, meeting_id, iteration, operation, target_id,
                   source_turn_ids, content, previous_content, rationale,
                   theme, known_defective
            FROM change_proposals
            WHERE project_id = %s AND iteration = %s
            ORDER BY id
            """,
            (project_id, iteration),
        )
        return [
            ChangeProposal(**row | {"source_turn_ids": list(row["source_turn_ids"])})
            for row in cur.fetchall()
        ]


def mark_defective(
    proposal: ChangeProposal, kind: str, note: str
) -> None:
    """Reemplaza una propuesta por su versión defectuosa.

    Se pisa en lugar de agregarse al lado. Si la correcta y la defectuosa
    convivieran, el revisor vería dos propuestas casi iguales sobre el mismo
    requisito y el defecto se delataría solo — se estaría midiendo la costura
    del experimento, no su vigilancia.

    Lo que el agente produjo no se pierde: `llm_calls` guarda la respuesta
    entera y es de solo anexado, así que la propuesta original se puede
    recuperar de ahí.
    """
    with cursor() as cur:
        cur.execute(
            """
            UPDATE change_proposals
            SET content = %s,
                source_turn_ids = %s,
                known_defective = TRUE,
                defect_kind = %s,
                defect_note = %s
            WHERE id = %s
            """,
            (
                proposal.content,
                proposal.source_turn_ids,
                kind,
                note,
                proposal.id,
            ),
        )


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
