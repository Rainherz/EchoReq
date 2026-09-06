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


class MeetingOut(Schema):
    id: str
    iteration: int
    label: str
    mode: str
    held_at: datetime
    has_consent: bool
    turn_count: int
    pending_proposals: int
    proposal_count: int
    audio_filename: str | None
    audio_bytes: int | None
    transcription_status: str
    transcription_error: str | None


class MeetingIn(Schema):
    label: str = Field(min_length=2, max_length=120)
    held_at: datetime
    participant_id: str


class MeetingAudioOut(Schema):
    filename: str
    size_bytes: int
    sha256: str
    transcription_status: str


class ProjectOut(Schema):
    id: str
    name: str
    format: str
    domain: str
    meeting_count: int
    created_at: datetime | None = None


class ProjectIn(Schema):
    name: str = Field(min_length=2, max_length=80)
    format: str = Field(default="user-story", pattern="^(user-story|ieee830)$")
    #: Qué sistema se está especificando. Entra en el prompt de generación.
    domain: str = Field(default="", max_length=600)


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


class CorrectionIn(Schema):
    decision_id: int
    participant_id: str
    intended_action: str = Field(pattern="^(accept|edit|reject)$")
    reason: str = Field(min_length=3)


class CorrectionOut(Schema):
    id: int


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


class RejectionOut(Schema):
    proposal_id: str
    iteration: int
    target_id: str
    operation: str
    rationale: str


class MetricsOut(Schema):
    iteration: int
    decisions: int
    median_seconds: float
    accepted_without_edit: int
    defective_accepted: int
    defective_total: int
    corrected: int


class ColumnOut(Schema):
    name: str
    meaning: str


class DatasetOut(Schema):
    name: str
    title: str
    purpose: str
    columns: list[ColumnOut]
    rows: int


class DriftOut(Schema):
    revision: int
    requirements: int
    over_atomic_limit: int
    mean_responsibilities: float
    max_responsibilities: int
