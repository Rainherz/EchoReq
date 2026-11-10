"""Esquemas HTTP.

Camel case hacia afuera para que el frontend consuma sin traducir; snake case
hacia adentro.
"""

from __future__ import annotations

from typing import Literal

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class Schema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class SpeakerSampleOut(Schema):
    turn_id: int
    starts_at: str
    ends_at: str | None
    start_seconds: float
    end_seconds: float
    text: str


class SuggestionOut(Schema):
    role: str
    name: str | None
    similarity: float
    from_meeting: str


class SpeakerOut(Schema):
    code: str
    role: str | None
    name: str | None
    turns: int
    characters: int
    # Modelo tipado y no `list[dict]`: la conversión a camelCase del esquema
    # solo alcanza a sus propios campos, así que un diccionario suelto viajaba
    # en snake_case y el cliente leía `undefined`.
    samples: list[SpeakerSampleOut]
    #: A qué voz conocida se parece. Se propone; la confirma una persona.
    suggestion: SuggestionOut | None = None


class SpeakerIn(Schema):
    role: str = Field(min_length=2, max_length=60)
    #: Opcional y no sale de la base: ni al modelo ni a las exportaciones.
    name: str | None = Field(default=None, max_length=80)


class ParticipantOut(Schema):
    id: str
    display_name: str
    role: str
    #: Arbitra los desacuerdos: es quien ve y usa Concordancia.
    is_lead: bool = False
    decisions: int
    created_at: datetime | None = None


class ParticipantIn(Schema):
    display_name: str = Field(min_length=2, max_length=80)
    role: str = Field(min_length=2, max_length=40)


class GlossaryActorOut(Schema):
    name: str
    description: str = ""
    transversal: bool = False


class GlossaryActorIn(Schema):
    name: str = Field(min_length=2, max_length=60)
    description: str = Field(default="", max_length=280)
    #: No distingue a nadie: aplica a cualquiera.
    transversal: bool = False


class GlossaryActorPatch(Schema):
    description: str = Field(default="", max_length=280)
    transversal: bool = False


class AcceptanceCriterionOut(Schema):
    id: int
    requirement_id: str
    written_against: int
    kind: str
    name: str = ""
    context: str = ""
    stimulus: str = ""
    outcome: str = ""
    question: str = ""
    ask_to: str = ""
    author: str = ""


class AcceptanceCriterionIn(Schema):
    requirement_id: str = Field(min_length=1, max_length=40)
    written_against: int = Field(ge=1)
    #: «scenario» cuando se pudo escribir el criterio; «question» cuando no se
    #: pudo sin volver a preguntar. El segundo es el dato de ambigüedad.
    kind: Literal["scenario", "question"]
    name: str = Field(default="", max_length=120)
    context: str = Field(default="", max_length=400)
    stimulus: str = Field(default="", max_length=400)
    outcome: str = Field(default="", max_length=400)
    question: str = Field(default="", max_length=400)
    ask_to: str = Field(default="", max_length=80)
    author: str = Field(min_length=1, max_length=80)


class ActorDecisionOut(Schema):
    observed: str
    outcome: str
    role: str | None = None
    note: str = ""


class ActorDecisionIn(Schema):
    observed: str = Field(min_length=2, max_length=80)
    #: «same» es el mismo rol escrito distinto, «new» un rol propio que
    #: faltaba declarar, «wrong» un requisito que nombra a quien no
    #: corresponde. Las tres contestan «qué representa este nombre».
    outcome: Literal["same", "new", "wrong"]
    role: str | None = Field(default=None, max_length=60)
    note: str = Field(default="", max_length=280)


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
    transcript_filename: str | None = None
    transcript_format: str | None = None


class MeetingIn(Schema):
    label: str = Field(min_length=2, max_length=120)
    held_at: datetime
    participant_id: str


class MeetingAudioOut(Schema):
    filename: str
    size_bytes: int
    sha256: str
    transcription_status: str


class TranscriptImportOut(Schema):
    filename: str
    #: `txt` o `vtt`.
    format: str
    sha256: str
    turn_count: int
    speakers: list[str]


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


class ProposalDecisionOut(Schema):
    participant_id: str
    participant_name: str | None
    action: str
    edited_content: str | None
    #: Cuánto tardó en decidir, en segundos.
    seconds: float


class ProposalConsolidationOut(Schema):
    outcome: str
    chosen_from: str | None
    resolved_by: str
    reason: str
    content: str | None


class MeetingProposalOut(Schema):
    """Una propuesta con su cita y lo que decidió cada revisor.

    A propósito no tiene `known_defective` ni el tipo de defecto: la vista es
    para leer cómo se tomó cada sugerencia y no puede revelar cuáles fueron
    sembradas. Igual que la cola de revisión.
    """

    id: str
    iteration: int
    operation: str
    target_id: str
    previous_content: str | None
    content: str | None
    source_turn_ids: list[int]
    rationale: str
    signals: list[SignalOut]
    theme: str | None
    decisions: list[ProposalDecisionOut]
    consolidation: ProposalConsolidationOut | None = None


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
    actors: list[str] = []


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


class AgreementOut(Schema):
    proposal_id: str
    iteration: int
    target_id: str
    operation: str
    known_defective: bool
    defect_kind: str | None
    #: participante → acción decidida.
    decisions: dict[str, str]
    #: participante → texto que dejó.
    texts: dict[str, str]
    #: Los textos resultantes no coinciden, aunque la acción sí.
    text_differs: bool
    #: De quién se adoptó la versión, si el desacuerdo ya se resolvió.
    chosen_from: str | None = None
    resolved_by: str | None = None
    consolidation_reason: str | None = None
    outcome: str | None = None
    consolidated_content: str | None = None
    #: Los revisores no coincidieron.
    disputed: bool
    reviewers: int


class ConsolidationIn(Schema):
    #: `adopt` hace regir la versión de un revisor, `drop` saca el requisito
    #: de la especificación y `rewrite` hace regir un texto del equipo.
    outcome: Literal["adopt", "drop", "rewrite"] = "adopt"
    #: De quién se adopta la versión. Sólo con `adopt`.
    chosen_from: str | None = None
    #: Texto que redacta el equipo. Sólo con `rewrite`.
    content: str | None = Field(default=None, max_length=2000)
    #: Quién resuelve. Puede no haber revisado la propuesta.
    resolved_by: str
    reason: str = Field(min_length=4, max_length=400)


class MetricsOut(Schema):
    iteration: int
    decisions: int
    median_seconds: float
    accepted_without_edit: int
    defective_accepted: int
    defective_undetected: int
    defective_total: int
    corrected: int
    mode: str


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
    #: Requisitos ya existentes que esta revisión volvió a tocar. Un alta no
    #: cuenta: crear no es cambiar.
    reopened: int
    #: `reopened` sobre el documento vigente, en porcentaje. SWEBOK v4 §7.4.
    volatility: float
