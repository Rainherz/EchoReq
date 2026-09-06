"""Adaptadores de persistencia sobre PostgreSQL.

SQL a mano, sin ORM. En un instrumento de investigación conviene ver
exactamente qué se guarda y qué se consulta: el análisis posterior lee estas
mismas tablas desde pandas.
"""

from __future__ import annotations

from statistics import median

import psycopg

from ...requirements.domain import rules
from ...requirements.domain.slug import slugify
from ...requirements.domain.entities import (
    ChangeProposal,
    DecisionCorrection,
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


class AlreadyCorrected(Exception):
    """Esa decisión ya se corrigió una vez."""


class DuplicateProject(Exception):
    """Ya existe un workspace con ese nombre."""


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
                SELECT p.id, p.name, p.format, p.domain, p.created_at,
                       count(m.id) AS meeting_count
                FROM projects p
                LEFT JOIN meetings m ON m.project_id = p.id
                WHERE p.archived_at IS NULL
                GROUP BY p.id, p.name, p.format, p.domain, p.created_at
                ORDER BY p.created_at DESC
                """
            )
            return [Project(**row) for row in cur.fetchall()]

    def project_exists(self, project_id: str) -> bool:
        with cursor() as cur:
            cur.execute(
                "SELECT 1 FROM projects WHERE id = %s AND archived_at IS NULL",
                (project_id,),
            )
            return cur.fetchone() is not None

    def create_project(self, name: str, fmt: str, domain: str) -> Project:
        """Crea el workspace. El identificador sale del nombre.

        Un identificador derivado del nombre se lee en la URL y en el nombre
        de los archivos exportados, que es donde el analista lo va a ver.
        """
        project_id = slugify(name)
        try:
            with cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO projects (id, name, format, domain)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id, name, format, domain, created_at
                    """,
                    (project_id, name.strip(), fmt, domain.strip()),
                )
                row = cur.fetchone()
        except psycopg.errors.UniqueViolation as exc:
            raise DuplicateProject(
                f"Ya existe un proyecto llamado «{name.strip()}»."
            ) from exc

        return Project(**row, meeting_count=0)

    def meetings(self, project_id: str, participant_id: str) -> list[Meeting]:
        """Reuniones del proyecto, con lo que le queda pendiente al participante."""
        with cursor() as cur:
            cur.execute(
                """
                SELECT
                    m.id, m.project_id, m.iteration, m.label, m.mode, m.held_at,
                    (m.consent_at IS NOT NULL) AS has_consent,
                    m.audio_filename, m.audio_bytes, m.transcription_status,
                    m.transcription_error,
                    (SELECT count(*) FROM turns t WHERE t.meeting_id = m.id)
                        AS turn_count,
                    (SELECT count(*) FROM change_proposals cp
                      WHERE cp.meeting_id = m.id
                        AND NOT EXISTS (
                            SELECT 1 FROM review_decisions d
                            WHERE d.proposal_id = cp.id
                              AND d.participant_id = %s
                        )) AS pending_proposals,
                    (SELECT count(*) FROM change_proposals cp
                      WHERE cp.meeting_id = m.id) AS proposal_count
                FROM meetings m
                WHERE m.project_id = %s
                ORDER BY m.iteration
                """,
                (participant_id, project_id),
            )
            return [Meeting(**row) for row in cur.fetchall()]


class PostgresMeetingRepository:
    """Escritura sobre la reunión: consentimiento y audio."""

    def create(self, project_id: str, label: str, held_at) -> str:
        """Crea la próxima reunión del proyecto.

        La iteración y el modo NO los elige quien crea: la primera reunión de
        un proyecto es de descubrimiento porque no hay documento contra el
        cual comparar, y las siguientes son de documentación viva. Dejarlo a
        criterio del usuario permitiría una cadena con dos descubrimientos, o
        con ninguno, y la curva de deriva dejaría de significar lo mismo.

        El identificador lleva el proyecto adentro: `m-<fecha>` colisionaba
        entre proyectos y entre dos reuniones del mismo día.
        """
        with cursor() as cur:
            cur.execute(
                "SELECT coalesce(max(iteration), 0) + 1 AS next "
                "FROM meetings WHERE project_id = %s",
                (project_id,),
            )
            iteration = cur.fetchone()["next"]
            mode = "discovery" if iteration == 1 else "living"
            meeting_id = f"{project_id}-r{iteration}"

            cur.execute(
                """
                INSERT INTO meetings (id, project_id, iteration, label, held_at, mode)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (meeting_id, project_id, iteration, label.strip(), held_at, mode),
            )
            return cur.fetchone()["id"]

    def exists(self, meeting_id: str) -> bool:
        with cursor() as cur:
            cur.execute("SELECT 1 FROM meetings WHERE id = %s", (meeting_id,))
            return cur.fetchone() is not None

    def record_consent(self, meeting_id: str) -> None:
        """Deja constancia del consentimiento.

        Se escribe una sola vez: `consent_at` no se pisa si ya estaba, para
        que la fecha registrada sea la de cuando se dio realmente.
        """
        with cursor() as cur:
            cur.execute(
                "UPDATE meetings SET consent_at = coalesce(consent_at, now()) "
                "WHERE id = %s RETURNING consent_at",
                (meeting_id,),
            )
            if cur.fetchone() is None:
                raise LookupError(f"No existe la reunión {meeting_id}.")

    def attach_audio(
        self,
        meeting_id: str,
        *,
        filename: str,
        path: str,
        size_bytes: int,
        sha256: str,
    ) -> None:
        """Asocia el audio y deja la transcripción pendiente."""
        with cursor() as cur:
            cur.execute(
                """
                UPDATE meetings
                SET audio_filename = %s,
                    audio_path = %s,
                    audio_bytes = %s,
                    audio_sha256 = %s,
                    uploaded_at = now(),
                    transcription_status = 'pending',
                    transcription_error = NULL
                WHERE id = %s
                RETURNING id
                """,
                (filename, path, size_bytes, sha256, meeting_id),
            )
            if cur.fetchone() is None:
                raise LookupError(f"No existe la reunión {meeting_id}.")


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
                SELECT iteration, action, known_defective, seconds, corrected
                FROM review_timings
                WHERE project_id = %s
                ORDER BY iteration
                """,
                (project_id,),
            )
            rows = cur.fetchall()

        # Las decisiones corregidas quedan fuera de las métricas: el revisor
        # declaró que no reflejan lo que quiso hacer. Siguen en la
        # exportación, marcadas, para que el análisis pueda revisarlas.
        by_iteration: dict[int, list[dict]] = {}
        corrections: dict[int, int] = {}
        for row in rows:
            if row["corrected"]:
                corrections[row["iteration"]] = corrections.get(row["iteration"], 0) + 1
                continue
            by_iteration.setdefault(row["iteration"], []).append(row)

        # Las iteraciones salen de la unión: una donde se corrigieron todas
        # las decisiones sigue siendo un dato, y desaparecer del reporte lo
        # escondería justo cuando más importa.
        out: list[IterationMetrics] = []
        for iteration in sorted(set(by_iteration) | set(corrections)):
            group = by_iteration.get(iteration, [])
            defective = [r for r in group if r["known_defective"]]
            out.append(
                IterationMetrics(
                    iteration=iteration,
                    decisions=len(group),
                    median_seconds=(
                        round(median(float(r["seconds"]) for r in group), 1)
                        if group
                        else 0.0
                    ),
                    accepted_without_edit=sum(1 for r in group if r["action"] == "accept"),
                    defective_accepted=sum(
                        1 for r in defective if r["action"] == "accept"
                    ),
                    defective_total=len(defective),
                    corrected=corrections.get(iteration, 0),
                )
            )
        return out


    def correct(self, correction: DecisionCorrection) -> int:
        """Anexa la corrección. Falla si esa decisión ya tenía una."""
        try:
            with cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO decision_corrections
                        (decision_id, participant_id, intended_action, reason)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        correction.decision_id,
                        correction.participant_id,
                        correction.intended_action,
                        correction.reason.strip(),
                    ),
                )
                return cur.fetchone()["id"]
        except psycopg.errors.UniqueViolation as exc:
            raise AlreadyCorrected(
                f"La decisión {correction.decision_id} ya se corrigió. "
                "Corregir una corrección sería el deshacer que esto evita."
            ) from exc

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
