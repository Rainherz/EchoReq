"""Puertos del dominio.

El dominio depende de estas interfaces, nunca de psycopg ni de FastAPI. Los
adaptadores concretos viven en ``app.adapters``.
"""

from __future__ import annotations

from typing import Protocol

from .entities import (
    ChangeProposal,
    DecisionCorrection,
    DocumentEntry,
    IterationMetrics,
    ProposalTrace,
    Rejection,
    RequirementRevision,
    ReviewDecision,
    Turn,
)


class ProposalRepository(Protocol):
    def pending_for_iteration(
        self, project_id: str, iteration: int, participant_id: str
    ) -> list[ChangeProposal]:
        """Propuestas de la iteración que el participante todavía no decidió."""
        ...

    def get(self, proposal_id: str) -> ChangeProposal | None: ...

    def trace_for_meeting(self, meeting_id: str) -> list[ProposalTrace]:
        """Todas las propuestas de la reunión con sus decisiones, por iteración."""
        ...


class DecisionRepository(Protocol):
    def record(self, decision: ReviewDecision) -> int:
        """Anexa la decisión y devuelve su identificador.

        Falla si el participante ya decidió esa propuesta: la medición
        registra la primera decisión, no la última.
        """
        ...

    def metrics_by_iteration(
        self, project_id: str, participant_id: str | None = None
    ) -> list[IterationMetrics]:
        """Cifras por iteración de una persona; sin ella, de toda la cadena."""
        ...

    def correct(self, correction: DecisionCorrection) -> int:
        """Anexa una corrección sobre una decisión ya registrada."""
        ...

    def rejections(
        self, project_id: str, participant_id: str | None = None
    ) -> list[Rejection]: ...


class DocumentRepository(Protocol):
    def revisions(self, project_id: str) -> list[RequirementRevision]: ...

    def document_at(self, project_id: str, revision: int) -> list[DocumentEntry]: ...

    def append(self, revision: RequirementRevision) -> bool:
        """Anexa la revisión; devuelve si esta llamada fue la que la escribió."""
        ...


class TranscriptRepository(Protocol):
    def turns_for_meeting(self, meeting_id: str) -> list[Turn]: ...
