"""Adaptadores de persistencia sobre PostgreSQL.

SQL a mano, sin ORM. En un instrumento de investigación conviene ver
exactamente qué se guarda y qué se consulta: el análisis posterior lee estas
mismas tablas desde pandas.
"""

from __future__ import annotations

from statistics import median

import psycopg

from ...requirements.domain import rules
from ...requirements.domain.injection import detected
from ...requirements.domain.slug import slugify
from ...requirements.domain.entities import (
    Participant,
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


class DuplicateParticipant(Exception):
    """Ya hay un participante con ese nombre."""


class PostgresParticipantRepository:
    """Alta y listado de quienes revisan."""

    def all(self) -> list[Participant]:
        with cursor() as cur:
            cur.execute(
                """
                SELECT p.id, p.display_name, p.role, p.is_lead, p.created_at,
                       (SELECT count(*) FROM review_decisions d
                         WHERE d.participant_id = p.id) AS decisions
                FROM participants p
                ORDER BY p.created_at
                """
            )
            return [Participant(**row) for row in cur.fetchall()]

    def create(self, display_name: str, role: str) -> Participant:
        """Da de alta un participante. El identificador sale del nombre.

        Queda en las exportaciones y en cada decisión registrada, así que se
        prefiere legible a opaco: `p-maria-quispe` dice a quién pertenece una
        serie sin tener que cruzarla contra otra tabla.
        """
        participant_id = f"p-{slugify(display_name)}"
        try:
            with cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO participants (id, display_name, role)
                    VALUES (%s, %s, %s)
                    RETURNING id, display_name, role, created_at
                    """,
                    (participant_id, display_name.strip(), role.strip()),
                )
                row = cur.fetchone()
        except psycopg.errors.UniqueViolation as exc:
            raise DuplicateParticipant(
                f"Ya existe un participante llamado «{display_name.strip()}»."
            ) from exc

        return Participant(**row, decisions=0)

    def exists(self, participant_id: str) -> bool:
        with cursor() as cur:
            cur.execute(
                "SELECT 1 FROM participants WHERE id = %s", (participant_id,)
            )
            return cur.fetchone() is not None


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

    def metrics_by_iteration(
        self, project_id: str, participant_id: str | None = None
    ) -> list[IterationMetrics]:
        """Cifras por iteración, de una persona.

        El participante no es opcional en la práctica: cada revisor produce su
        propia serie sobre la misma cola, y promediarlas devuelve una mediana
        que no es de nadie. Con dos revisores sobre doce propuestas, la
        iteración figuraba con veinticuatro decisiones.

        Se deja admitir `None` para mirar el proyecto entero, pero eso responde
        «qué pasó en esta cadena», no «cómo revisó esta persona», que es lo que
        el estudio compara.
        """
        with cursor() as cur:
            cur.execute(
                """
                SELECT iteration, action, known_defective, seconds, corrected,
                       mode, defect_kind
                FROM review_timings
                WHERE project_id = %s
                  AND (%s::text IS NULL OR participant_id = %s)
                ORDER BY iteration
                """,
                (project_id, participant_id, participant_id),
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
                    defective_undetected=sum(
                        1
                        for r in defective
                        if not detected(r["defect_kind"], r["action"])
                    ),
                    defective_total=len(defective),
                    corrected=corrections.get(iteration, 0),
                    mode=group[0]["mode"] if group else "living",
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

    def consolidate(
        self,
        proposal_id: str,
        resolved_by: str,
        reason: str,
        outcome: str = "adopt",
        chosen_from: str | None = None,
        content: str | None = None,
    ) -> None:
        """Resuelve un desacuerdo para la especificación.

        Tres salidas. `adopt` hace regir la versión de un revisor; `drop` saca
        el requisito, porque a veces el problema no es cómo está redactado
        sino que no corresponde; `rewrite` hace regir un texto del equipo,
        cuando ninguna de las versiones sirve.

        No toca `review_decisions`: la decisión de cada uno es el dato del
        estudio y queda intacta. Esto se apoya encima y dice cuál se adoptó.

        Se puede rehacer. Una decisión de revisión no se corrige porque
        registra lo que alguien hizo en un instante; una consolidación es la
        postura del equipo sobre su propio documento, y esa sí puede cambiar
        en la reunión siguiente.
        """
        with cursor() as cur:
            cur.execute(
                """
                INSERT INTO consolidations
                    (proposal_id, chosen_from, resolved_by, reason, outcome,
                     content)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (proposal_id) DO UPDATE
                SET chosen_from = EXCLUDED.chosen_from,
                    resolved_by = EXCLUDED.resolved_by,
                    reason = EXCLUDED.reason,
                    outcome = EXCLUDED.outcome,
                    content = EXCLUDED.content,
                    resolved_at = now()
                """,
                (
                    proposal_id,
                    chosen_from,
                    resolved_by,
                    reason.strip(),
                    outcome,
                    (content or "").strip() or None,
                ),
            )

    def agreement(self, project_id: str) -> list[dict]:
        """Qué decidió cada revisor sobre cada propuesta.

        Es lo que justifica tener más de un revisor: dos series paralelas sólo
        sirven si se pueden cruzar. Un desacuerdo señala una propuesta cuya
        corrección no es evidente, y esa distinción —lo que se decide igual
        frente a lo que divide— no existe con una sola serie.

        Devuelve una fila por propuesta decidida, con el mapa de quién decidió
        qué. Las que nadie decidió todavía quedan fuera.
        """
        with cursor() as cur:
            cur.execute(
                """
                SELECT p.id, p.iteration, p.target_id, p.operation,
                       p.known_defective, p.defect_kind,
                       jsonb_object_agg(d.participant_id, d.action) AS decisions,
                       -- El texto que dejó cada uno: el editado si lo cambió,
                       -- y si no el que propuso el agente. Sin esto la tabla
                       -- dice quién editó pero no qué escribió, que es donde
                       -- está la diferencia que se quiere comparar.
                       jsonb_object_agg(
                           d.participant_id,
                           coalesce(d.edited_content, p.content, '')
                       ) AS texts,
                       count(DISTINCT d.action) > 1 AS disputed,
                       -- Dos ediciones distintas son un desacuerdo aunque la
                       -- acción sea la misma: lo que queda en el documento es
                       -- el texto, no la etiqueta.
                       count(DISTINCT coalesce(d.edited_content, p.content, '')) > 1
                           AS text_differs,
                       count(*) AS reviewers,
                       max(c.chosen_from)  AS chosen_from,
                       max(c.resolved_by)  AS resolved_by,
                       max(c.reason)       AS consolidation_reason,
                       max(c.outcome)      AS outcome,
                       max(c.content)      AS consolidated_content
                FROM change_proposals p
                JOIN review_decisions d ON d.proposal_id = p.id
                LEFT JOIN consolidations c ON c.proposal_id = p.id
                WHERE p.project_id = %s
                GROUP BY p.id, p.iteration, p.target_id, p.operation,
                         p.known_defective, p.defect_kind
                ORDER BY p.iteration, p.id
                """,
                (project_id,),
            )
            return cur.fetchall()

    def rejections(
        self, project_id: str, participant_id: str | None = None
    ) -> list[Rejection]:
        with cursor() as cur:
            cur.execute(
                """
                SELECT p.id, p.iteration, p.target_id, p.operation, p.rationale
                FROM review_decisions d
                JOIN change_proposals p ON p.id = d.proposal_id
                WHERE p.project_id = %s AND d.action = 'reject'
                  AND (%s::text IS NULL OR d.participant_id = %s)
                ORDER BY p.iteration, p.id
                """,
                (project_id, participant_id, participant_id),
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
                WITH adopted AS (
                    -- Texto que el equipo adoptó al resolver un desacuerdo.
                    -- La revisión guardada no se toca: registra lo que se
                    -- escribió cuando se decidió. Esta capa dice cuál versión
                    -- rige, igual que las etiquetas de voz no reescriben lo
                    -- que observó la diarización.
                    SELECT cp.target_id, cp.iteration, c.outcome,
                           CASE c.outcome
                               WHEN 'rewrite' THEN c.content
                               WHEN 'adopt'   THEN coalesce(d.edited_content,
                                                            cp.content)
                           END AS content
                    FROM consolidations c
                    JOIN change_proposals cp ON cp.id = c.proposal_id
                    LEFT JOIN review_decisions d
                           ON d.proposal_id = cp.id
                          AND d.participant_id = c.chosen_from
                    WHERE cp.project_id = %s
                ),
                history AS (
                    SELECT
                        rr.requirement_id,
                        rr.revision,
                        -- Un descarte del equipo pesa igual que una baja: el
                        -- requisito sale de la especificación aunque la
                        -- revisión guardada diga que se creó.
                        CASE WHEN a.outcome = 'drop' THEN 'delete'
                             ELSE rr.operation END AS operation,
                        coalesce(a.content, rr.content) AS content,
                        MIN(rr.revision) OVER (PARTITION BY rr.requirement_id) AS born,
                        COUNT(*)  OVER (PARTITION BY rr.requirement_id) AS entries,
                        ROW_NUMBER() OVER (
                            PARTITION BY rr.requirement_id ORDER BY rr.revision DESC
                        ) AS recency
                    FROM requirement_revisions rr
                    LEFT JOIN adopted a
                           ON a.target_id = rr.requirement_id
                          AND a.iteration = rr.revision
                    WHERE rr.project_id = %s AND rr.revision <= %s
                )
                SELECT requirement_id, content, born, entries, revision
                FROM history
                WHERE recency = 1 AND operation <> 'delete'
                ORDER BY requirement_id
                """,
                (project_id, project_id, revision),
            )
            return [
                DocumentEntry(
                    requirement_id=row["requirement_id"],
                    content=row["content"],
                    born_in_revision=row["born"],
                    last_revision=row["revision"],
                    change_count=row["entries"] - 1,
                    responsibilities=rules.estimate_responsibilities(row["content"]),
                    actors=rules.extract_actors(row["content"]),
                )
                for row in cur.fetchall()
            ]

    def append(self, revision: RequirementRevision) -> bool:
        """Anexa la revisión. Devuelve si esta llamada fue la que la escribió.

        El documento es uno solo por proyecto y las decisiones son por
        persona, así que dos revisores sobre la misma cola llegan al mismo
        requisito. El primero lo escribe; el segundo no lo pisa. Su decisión
        igual queda registrada —es lo que mide el estudio— pero la
        especificación no se reescribe según quién terminó último.
        """
        with cursor() as cur:
            cur.execute(
                """
                INSERT INTO requirement_revisions
                    (project_id, requirement_id, revision, meeting_id,
                     operation, content, source_turn_ids, summary)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (project_id, requirement_id, revision) DO NOTHING
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
            return cur.rowcount > 0


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
