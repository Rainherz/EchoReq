"""Contrato de generación de propuestas.

Lo que el agente puede devolver está acotado por tipos, no por confianza en
que respete el formato. Una propuesta que no encaja acá no llega a la cola de
revisión.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Protocol

from pydantic import BaseModel, Field

from .entities import Turn


class DraftSignal(BaseModel):
    rule: str = Field(description="Identificador corto de la regla, en minúsculas.")
    label: str = Field(description="Nombre visible de la señal.")
    detail: str = Field(description="Qué observó la regla, en una o dos oraciones.")


class DraftProposal(BaseModel):
    """Una propuesta tal como la devuelve el agente, antes de validarla."""

    operation: Literal["create", "modify", "delete", "conflict"]
    target_id: str = Field(
        description="Requisito afectado. Para un alta, el próximo identificador libre."
    )
    content: str | None = Field(
        default=None, description="Texto propuesto del requisito. Vacío solo en una baja."
    )
    source_turn_ids: list[int] = Field(
        description=(
            "Turnos de la transcripción que sostienen la propuesta. "
            "Obligatorio: sin cita verificable la propuesta se descarta."
        )
    )
    rationale: str = Field(description="Por qué se propone el cambio, en una oración.")
    signals: list[DraftSignal] = Field(default_factory=list)
    theme: str | None = Field(
        default=None, description="Agrupamiento temático, solo en modo descubrimiento."
    )


class DraftBatch(BaseModel):
    proposals: list[DraftProposal]


@dataclass(frozen=True, slots=True)
class GenerationRequest:
    project_id: str
    meeting_id: str
    iteration: int
    mode: Literal["discovery", "living"]
    turns: list[Turn]
    #: Especificación vigente. Vacía en modo descubrimiento.
    baseline: list[tuple[str, str]]
    #: Quién es cada voz, según el analista. Vacío mientras no se etiquetaron:
    #: ahí el agente ve los códigos crudos y no puede distinguir quién pide de
    #: quién pregunta.
    speakers: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class GenerationResult:
    proposals: list[DraftProposal]
    model_id: str
    params: dict[str, object]
    prompt: str
    response: str
    input_tokens: int | None = None
    output_tokens: int | None = None


class ProposalEngine(Protocol):
    """Puerto de generación.

    Detrás vive el modelo real o el adaptador de reproducción, que relee las
    llamadas ya registradas. El dominio no distingue cuál.
    """

    def generate(self, request: GenerationRequest) -> GenerationResult: ...


@dataclass(frozen=True, slots=True)
class RejectedDraft:
    """Propuesta descartada antes de llegar a la cola, y por qué."""

    draft: DraftProposal
    reason: str
