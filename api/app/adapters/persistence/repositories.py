"""Adaptadores de persistencia sobre PostgreSQL.

SQL a mano, sin ORM. En un instrumento de investigación conviene ver
exactamente qué se guarda y qué se consulta: el análisis posterior lee estas
mismas tablas desde pandas.
"""

from __future__ import annotations

from statistics import median

import psycopg

from ...requirements.domain import rules
from ...requirements.domain.entities import (
    ChangeProposal,
    DocumentEntry,
    IterationMetrics,
    Meeting,
    Project,
    QualitySignal,
    Rejection,
    RequirementRevision,
    ReviewDecision,
    Turn,
)
from .pool import cursor


class AlreadyDecided(Exception):
    """El participante ya decidió esa propuesta."""


def _to_proposal(row: dict) -> ChangeProposal:
    return ChangeProposal(
        id=row["id"],
        project_id=row["project_id"],
        meeting_id=row["meeting_id"],
        iteration=row["iteration"],
        operation=row["operation"],
        target_id=row["target_id"],
        source_turn_ids=list(row["source_turn_ids"]),
        content=row["content"],
        previous_content=row["previous_content"],
        rationale=row["rationale"],
        signals=[QualitySignal(**s) for s in row["signals"]],
        theme=row["theme"],
        known_defective=row["known_defective"],
    )


class PostgresCatalogRepository:
    """Proyectos y reuniones. Es el contexto que elige el revisor antes de
    ponerse a trabajar."""

    def projects(self) -> list[Project]:
        with cursor() as cur:
            cur.execute(
                """
                SELECT p.id, p.name, p.format, count(m.id) AS meeting_count
                FROM projects p
                LEFT JOIN meetings m ON m.project_id = p.id
                GROUP BY p.id, p.name, p.format
                ORDER BY p.name
                """
            )
            return [Project(**row) for row in cur.fetchall()]

    def meetings(self, project_id: str, participant_id: str) -> list[Meeting]:
        """Reuniones del proyecto, con lo que le queda pendiente al participante."""
        with cursor() as cur:
            cur.execute(
                """
                SELECT
                    m.id, m.project_id, m.iteration, m.label, m.mode, m.held_at,
                    (m.consent_at IS NOT NULL) AS has_consent,
                    (SELECT count(*) FROM turns t WHERE t.meeting_id = m.id)
                        AS turn_count,
                    (SELECT count(*) FROM change_proposals cp
                      WHERE cp.meeting_id = m.id
                        AND NOT EXISTS (
                            SELECT 1 FROM review_decisions d
                            WHERE d.proposal_id = cp.id
                              AND d.participant_id = %s
                        )) AS pending_proposals
                FROM meetings m
                WHERE m.project_id = %s
                ORDER BY m.iteration
                """,
                (participant_id, project_id),
            )
            return [Meeting(**row) for row in cur.fetchall()]


class PostgresProposalRepository:
    def pending_for_iteration(
        self, project_id: str, iteration: int, participant_id: str
    ) -> list[ChangeProposal]:
        with cursor() as cur:
            cur.execute(
                """
                SELECT p.*
                FROM change_proposals p
                WHERE p.project_id = %s
                  AND p.iteration = %s
                  AND NOT EXISTS (
                      SELECT 1 FROM review_decisions d
                      WHERE d.proposal_id = p.id
                        AND d.participant_id = %s
                  )
                ORDER BY p.created_at, p.id
                """,
                (project_id, iteration, participant_id),
            )
            return [_to_proposal(row) for row in cur.fetchall()]

    def get(self, proposal_id: str) -> ChangeProposal | None:
        with cursor() as cur:
            cur.execute("SELECT * FROM change_proposals WHERE id = %s", (proposal_id,))
            row = cur.fetchone()
            return _to_proposal(row) if row else None


class PostgresDecisionRepository:
    def record(self, decision: ReviewDecision) -> int:
        try:
            with cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO review_decisions
                        (proposal_id, participant_id, action,
                         presented_at, decided_at, edited_content)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        decision.proposal_id,
                        decision.participant_id,
                        decision.action,
                        decision.presented_at,
                        decision.decided_at,
                        decision.edited_content,
                    ),
                )
                return cur.fetchone()["id"]
        except psycopg.errors.UniqueViolation as exc:
            raise AlreadyDecided(
                f"{decision.participant_id} ya decidió {decision.proposal_id}. "
                "La medición registra la primera decisión, no la última."
            ) from exc

    def metrics_by_iteration(self, project_id: str) -> list[IterationMetrics]:
        with cursor() as cur:
            cur.execute(
                """
                SELECT iteration, action, known_defective, seconds
                FROM review_timings
                WHERE project_id = %s
                ORDER BY iteration
                """,
                (project_id,),
            )
            rows = cur.fetchall()

        by_iteration: dict[int, list[dict]] = {}
        for row in rows:
            by_iteration.setdefault(row["iteration"], []).append(row)

        out: list[IterationMetrics] = []
        for iteration in sorted(by_iteration):
            group = by_iteration[iteration]
            defective = [r for r in group if r["known_defective"]]
            out.append(
                IterationMetrics(
                    iteration=iteration,
                    decisions=len(group),
                    median_seconds=round(median(float(r["seconds"]) for r in group), 1),
                    accepted_without_edit=sum(1 for r in group if r["action"] == "accept"),
                    defective_accepted=sum(
                        1 for r in defective if r["action"] == "accept"
                    ),
                    defective_total=len(defective),
                )
            )
        return out


    def rejections(self, project_id: str) -> list[Rejection]:
        with cursor() as cur:
            cur.execute(
                """
                SELECT p.id, p.iteration, p.target_id, p.operation, p.rationale
                FROM review_decisions d
                JOIN change_proposals p ON p.id = d.proposal_id
                WHERE p.project_id = %s AND d.action = 'reject'
                ORDER BY p.iteration, p.id
                """,
                (project_id,),
            )
            return [
                Rejection(
                    proposal_id=row["id"],
                    iteration=row["iteration"],
                    target_id=row["target_id"],
                    operation=row["operation"],
                    rationale=row["rationale"],
                )
                for row in cur.fetchall()
            ]


class PostgresDocumentRepository:
    def revisions(self, project_id: str) -> list[RequirementRevision]:
        with cursor() as cur:
            cur.execute(
                """
                SELECT * FROM requirement_revisions
                WHERE project_id = %s
                ORDER BY revision, requirement_id
                """,
                (project_id,),
            )
            return [
                RequirementRevision(
                    project_id=row["project_id"],
                    requirement_id=row["requirement_id"],
                    revision=row["revision"],
                    meeting_id=row["meeting_id"],
                    operation=row["operation"],
                    content=row["content"],
                    source_turn_ids=list(row["source_turn_ids"]),
                    summary=row["summary"],
                )
                for row in cur.fetchall()
            ]

    def document_at(self, project_id: str, revision: int) -> list[DocumentEntry]:
        """Deriva la especificación vigente en ``revision``.

        El documento no se guarda mutado: se calcula tomando la última fila de
        cada requisito hasta esa revisión. Por eso el análisis de deriva es una
        consulta y no una reconstrucción.
        """
        with cursor() as cur:
            cur.execute(
                """
                WITH history AS (
                    SELECT
                        requirement_id,
                        revision,
                        operation,
                        content,
                        MIN(revision) OVER (PARTITION BY requirement_id) AS born,
                        COUNT(*)  OVER (PARTITION BY requirement_id) AS entries,
                        ROW_NUMBER() OVER (
                            PARTITION BY requirement_id ORDER BY revision DESC
                        ) AS recency
                    FROM requirement_revisions
                    WHERE project_id = %s AND revision <= %s
                )
                SELECT requirement_id, content, born, entries, revision
                FROM history
                WHERE recency = 1 AND operation <> 'delete'
                ORDER BY requirement_id
                """,
                (project_id, revision),
            )
            return [
                DocumentEntry(
                    requirement_id=row["requirement_id"],
                    content=row["content"],
                    born_in_revision=row["born"],
                    last_revision=row["revision"],
                    change_count=row["entries"] - 1,
                    responsibilities=rules.estimate_responsibilities(row["content"]),
                )
                for row in cur.fetchall()
            ]

    def append(self, revision: RequirementRevision) -> None:
        with cursor() as cur:
            cur.execute(
                """
                INSERT INTO requirement_revisions
                    (project_id, requirement_id, revision, meeting_id,
                     operation, content, source_turn_ids, summary)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    revision.project_id,
                    revision.requirement_id,
                    revision.revision,
                    revision.meeting_id,
                    revision.operation,
                    revision.content,
                    revision.source_turn_ids,
                    revision.summary,
                ),
            )


class PostgresTranscriptRepository:
    def turns_for_meeting(self, meeting_id: str) -> list[Turn]:
        with cursor() as cur:
            cur.execute(
                """
                SELECT meeting_id, turn_id, speaker, starts_at, text
                FROM turns
                WHERE meeting_id = %s
                ORDER BY turn_id
                """,
                (meeting_id,),
            )
            return [Turn(**row) for row in cur.fetchall()]
