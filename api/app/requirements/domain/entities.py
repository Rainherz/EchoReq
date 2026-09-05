"""Entidades del dominio.

Espejo del contrato que ya usa el frontend. Los nombres de campo coinciden
con las columnas persistidas para que ninguna capa invente una forma que la
base no guarda.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

Operation = Literal["create", "modify", "delete", "conflict"]
Action = Literal["accept", "edit", "reject"]
Mode = Literal["discovery", "living"]


@dataclass(frozen=True, slots=True)
class Turn:
    """Unidad de cita del sistema. Sin identificador estable no hay traza."""

    meeting_id: str
    turn_id: int
    speaker: str
    starts_at: str
    text: str


@dataclass(frozen=True, slots=True)
class QualitySignal:
    rule: str
    label: str
    detail: str


@dataclass(frozen=True, slots=True)
class ChangeProposal:
    id: str
    project_id: str
    meeting_id: str
    iteration: int
    operation: Operation
    target_id: str
    source_turn_ids: list[int]
    content: str | None = None
    previous_content: str | None = None
    rationale: str = ""
    signals: list[QualitySignal] = field(default_factory=list)
    theme: str | None = None
    #: Marcada por el guion de inyección como incorrecta a sabiendas.
    #: Es el denominador de la métrica de aceptación de propuestas defectuosas.
    known_defective: bool = False

    def __post_init__(self) -> None:
        if not self.source_turn_ids:
            raise ValueError(
                f"La propuesta {self.id} no cita ningún turno. "
                "Una propuesta que no puede señalar la transcripción no llega "
                "a la pantalla de revisión."
            )


@dataclass(frozen=True, slots=True)
class ReviewDecision:
    """Salida del instrumento.

    ``presented_at`` y ``decided_at`` se capturan en el momento de la decisión
    y nunca se reconstruyen: una iteración revisada sin ellos no se recupera.
    """

    proposal_id: str
    participant_id: str
    action: Action
    presented_at: datetime
    decided_at: datetime
    edited_content: str | None = None

    def __post_init__(self) -> None:
        if self.decided_at < self.presented_at:
            raise ValueError(
                "decided_at es anterior a presented_at: el intervalo de "
                "revisión no puede ser negativo."
            )

    @property
    def seconds(self) -> float:
        return (self.decided_at - self.presented_at).total_seconds()


@dataclass(frozen=True, slots=True)
class DecisionCorrection:
    """Marca de que una decisión se registró por error.

    No borra ni modifica la original: la decisión y su intervalo siguen en los
    datos, señalados. El análisis decide si los excluye, y la tasa de
    corrección es una medida de confiabilidad del instrumento.
    """

    decision_id: int
    participant_id: str
    intended_action: Action
    reason: str

    def __post_init__(self) -> None:
        if len(self.reason.strip()) < 3:
            raise ValueError(
                "La corrección necesita un motivo. Sin él la marca no dice "
                "nada al analizar, y corregir se vuelve un deshacer."
            )


@dataclass(frozen=True, slots=True)
class RequirementRevision:
    project_id: str
    requirement_id: str
    revision: int
    meeting_id: str
    operation: Operation
    content: str
    source_turn_ids: list[int]
    summary: str = ""


@dataclass(frozen=True, slots=True)
class DocumentEntry:
    """Un requisito tal como queda en una revisión dada."""

    requirement_id: str
    content: str
    born_in_revision: int
    last_revision: int
    change_count: int
    responsibilities: int


@dataclass(frozen=True, slots=True)
class Meeting:
    """Una reunión procesada del proyecto."""

    id: str
    project_id: str
    iteration: int
    label: str
    mode: Mode
    held_at: datetime
    has_consent: bool
    turn_count: int
    pending_proposals: int
    audio_filename: str | None = None
    audio_bytes: int | None = None
    transcription_status: str = "pending"
    transcription_error: str | None = None


@dataclass(frozen=True, slots=True)
class Project:
    id: str
    name: str
    format: str
    meeting_count: int


@dataclass(frozen=True, slots=True)
class Rejection:
    """Propuesta rechazada. La ausencia que deja es un dato del estudio."""

    proposal_id: str
    iteration: int
    target_id: str
    operation: str
    rationale: str


@dataclass(frozen=True, slots=True)
class IterationMetrics:
    """Las cifras que sostienen H1, H2 y H3, por iteración."""

    iteration: int
    decisions: int
    median_seconds: float
    accepted_without_edit: int
    defective_accepted: int
    defective_total: int
    #: Decisiones que el revisor marcó como error de registro. Excluidas de
    #: las cifras de arriba, contadas acá.
    corrected: int = 0
