"""Esquemas HTTP.

Camel case hacia afuera para que el frontend consuma sin traducir; snake case
hacia adentro.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class Schema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class TurnOut(Schema):
    id: int
    meeting_id: str
    speaker: str
    starts_at: str
    text: str


class SignalOut(Schema):
    rule: str
    label: str
    detail: str


class ProposalOut(Schema):
    id: str
    iteration: int
    operation: str
    target_id: str
    content: str | None
    previous_content: str | None
    source_turn_ids: list[int]
    rationale: str
    signals: list[SignalOut]
    theme: str | None
    context_turns: list[TurnOut]


class DecisionIn(Schema):
    proposal_id: str
    participant_id: str
    action: str = Field(pattern="^(accept|edit|reject)$")
    #: Instantes capturados por la interfaz. El servidor no los infiere:
    #: sustituirlos por la hora de llegada mediría la latencia de red.
    presented_at: datetime
    decided_at: datetime
    edited_content: str | None = None


class DecisionOut(Schema):
    id: int
    seconds: float


class DocumentEntryOut(Schema):
    requirement_id: str
    content: str
    born_in_revision: int
    last_revision: int
    change_count: int
    responsibilities: int


class RevisionOut(Schema):
    requirement_id: str
    revision: int
    meeting_id: str
    operation: str
    content: str
    source_turn_ids: list[int]
    summary: str


class MetricsOut(Schema):
    iteration: int
    decisions: int
    median_seconds: float
    accepted_without_edit: int
    defective_accepted: int
    defective_total: int


class DriftOut(Schema):
    revision: int
    requirements: int
    over_atomic_limit: int
    mean_responsibilities: float
    max_responsibilities: int
