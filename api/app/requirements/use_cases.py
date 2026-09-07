"""Casos de uso.

Coordinan puertos. No conocen HTTP ni SQL.
"""

from __future__ import annotations

from dataclasses import dataclass

from .domain import rules
from .domain.entities import (
    ChangeProposal,
    DocumentEntry,
    IterationMetrics,
    RequirementRevision,
    ReviewDecision,
    Turn,
)
from .domain.ports import (
    DecisionRepository,
    DocumentRepository,
    ProposalRepository,
    TranscriptRepository,
)

#: Turnos de contexto a cada lado de la cita. Sin contexto el revisor no
#: puede verificar y termina confiando por defecto.
CONTEXT_WINDOW = 2


@dataclass(frozen=True, slots=True)
class ProposalWithContext:
    proposal: ChangeProposal
    context_turns: list[Turn]


class ReviewQueue:
    """Cola de revisión de una iteración."""

    def __init__(
        self,
        proposals: ProposalRepository,
        transcripts: TranscriptRepository,
        decisions: DecisionRepository,
        documents: DocumentRepository | None = None,
    ) -> None:
        self._proposals = proposals
        self._transcripts = transcripts
        self._decisions = decisions
        self._documents = documents

    def pending(
        self, project_id: str, iteration: int, participant_id: str
    ) -> list[ProposalWithContext]:
        pending = self._proposals.pending_for_iteration(
            project_id, iteration, participant_id
        )
        return [
            ProposalWithContext(
                proposal=proposal,
                context_turns=self._context_for(proposal),
            )
            for proposal in pending
        ]

    def record(self, decision: ReviewDecision) -> int:
        """Registra la decisión y, si aprueba un cambio, lo aplica al documento.

        Se aplica al decidir y no al cerrar la iteración: el documento crece
        mientras se revisa, así que abandonar la cola a la mitad deja una
        revisión parcial. Es detectable —las métricas dicen cuántas decisiones
        tiene cada iteración— pero conviene saberlo al comparar.

        Rechazar no escribe nada, y un conflicto tampoco: señala una
        contradicción para que alguien la resuelva, no la resuelve.
        """
        proposal = self._proposals.get(decision.proposal_id)
        if proposal is None:
            raise LookupError(f"La propuesta {decision.proposal_id} no existe.")

        decision_id = self._decisions.record(decision)

        if self._documents is not None and decision.action != "reject":
            self._apply(proposal, decision)

        return decision_id

    def _apply(self, proposal: ChangeProposal, decision: ReviewDecision) -> None:
        """Lleva al documento lo que el revisor aprobó.

        El texto que se guarda es el que el revisor dejó, no el que propuso el
        agente: si lo editó, el documento tiene que decir lo que él escribió.
        """
        if proposal.operation == "conflict":
            return

        content = decision.edited_content or proposal.content or ""
        if not content and proposal.operation != "delete":
            return

        assert self._documents is not None
        self._documents.append(
            RequirementRevision(
                project_id=proposal.project_id,
                requirement_id=proposal.target_id,
                revision=proposal.iteration,
                meeting_id=proposal.meeting_id,
                operation=proposal.operation,
                content=content,
                source_turn_ids=list(proposal.source_turn_ids),
                summary=proposal.rationale,
            )
        )

    def _context_for(self, proposal: ChangeProposal) -> list[Turn]:
        """Una ventana alrededor de cada cita, no un tramo entre la primera y
        la última.

        La diferencia no es cosmética. Una propuesta que cita los turnos 20 y
        88 tomaba, con el tramo continuo, los 73 turnos del medio: tres
        cuartos de la entrevista para verificar una cita. Eso rompe la
        medición por los dos lados — infla el tiempo de decisión con lectura
        que no hace falta, y sobre todo empuja al revisor a dejar de leer y
        empezar a confiar, que es exactamente la conducta que el estudio tiene
        que poder distinguir.

        Las ventanas que se solapan quedan pegadas; las que no, dejan un hueco
        que la interfaz muestra como tal.
        """
        turns = self._transcripts.turns_for_meeting(proposal.meeting_id)
        cited = set(proposal.source_turn_ids)
        positions = [i for i, turn in enumerate(turns) if turn.turn_id in cited]
        if not positions:
            return []

        keep: set[int] = set()
        for position in positions:
            start = max(0, position - CONTEXT_WINDOW)
            stop = min(len(turns), position + CONTEXT_WINDOW + 1)
            keep.update(range(start, stop))

        return [turns[index] for index in sorted(keep)]


class SpecificationReader:
    """Lectura de la especificación en una revisión dada."""

    def __init__(self, documents: DocumentRepository) -> None:
        self._documents = documents

    def at(self, project_id: str, revision: int) -> list[DocumentEntry]:
        return self._documents.document_at(project_id, revision)

    def history(self, project_id: str, requirement_id: str) -> list[RequirementRevision]:
        return [
            row
            for row in self._documents.revisions(project_id)
            if row.requirement_id == requirement_id
        ]

    def drift_by_revision(self, project_id: str) -> list[dict[str, object]]:
        """Deriva sintáctica por revisión.

        Métrica automática y determinista: proporción de requisitos que
        exceden el límite de atomicidad y promedio de responsabilidades.
        """
        revisions = self._documents.revisions(project_id)
        if not revisions:
            return []

        out: list[dict[str, object]] = []
        for revision in range(1, max(row.revision for row in revisions) + 1):
            entries = self._documents.document_at(project_id, revision)
            if not entries:
                continue
            over = [e for e in entries if e.responsibilities > rules.ATOMIC_LIMIT]
            out.append(
                {
                    "revision": revision,
                    "requirements": len(entries),
                    "over_atomic_limit": len(over),
                    "mean_responsibilities": round(
                        sum(e.responsibilities for e in entries) / len(entries), 2
                    ),
                    "max_responsibilities": max(e.responsibilities for e in entries),
                }
            )
        return out


class StudyMetrics:
    """Las cifras que sostienen las hipótesis, por iteración."""

    def __init__(self, decisions: DecisionRepository) -> None:
        self._decisions = decisions

    def by_iteration(
        self, project_id: str, participant_id: str | None = None
    ) -> list[IterationMetrics]:
        return self._decisions.metrics_by_iteration(project_id, participant_id)
