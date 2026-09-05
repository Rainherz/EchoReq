"""Generación de propuestas para una reunión.

El agente propone; este módulo decide qué llega a la cola de revisión. La
validación vive acá y no en el adaptador a propósito: es una regla del método
del estudio, no un detalle del proveedor de modelo.
"""

from __future__ import annotations

from dataclasses import dataclass

from .domain.entities import ChangeProposal, QualitySignal, Turn
from .domain.generation import (
    DraftProposal,
    GenerationRequest,
    GenerationResult,
    ProposalEngine,
    RejectedDraft,
)


@dataclass(frozen=True, slots=True)
class GenerationOutcome:
    accepted: list[ChangeProposal]
    rejected: list[RejectedDraft]
    result: GenerationResult

    @property
    def summary(self) -> str:
        return (
            f"{len(self.accepted)} propuestas admitidas, "
            f"{len(self.rejected)} descartadas antes de la revisión"
        )


def _validate(
    draft: DraftProposal,
    turns: list[Turn],
    known_requirements: set[str],
) -> str | None:
    """Devuelve el motivo del descarte, o None si la propuesta es admisible."""
    valid_turns = {turn.turn_id for turn in turns}

    if not draft.source_turn_ids:
        return "no cita ningún turno"

    invented = sorted(set(draft.source_turn_ids) - valid_turns)
    if invented:
        # El modo de falla que la cita obligatoria existe para atajar: una
        # propuesta que apunta a un turno inexistente es una que se inventó
        # el respaldo.
        return f"cita turnos que no existen en la reunión: {invented}"

    if draft.operation in {"modify", "delete", "conflict"}:
        if draft.target_id not in known_requirements:
            return (
                f"declara {draft.operation} sobre {draft.target_id}, "
                "que no está en la especificación vigente"
            )

    if draft.operation == "create" and draft.target_id in known_requirements:
        return f"propone crear {draft.target_id}, que ya existe"

    if draft.operation != "delete" and not (draft.content or "").strip():
        return "no trae texto de requisito"

    return None


def generate_proposals(
    engine: ProposalEngine,
    request: GenerationRequest,
    *,
    id_prefix: str = "p",
) -> GenerationOutcome:
    """Genera y filtra las propuestas de una reunión.

    Las descartadas se devuelven con su motivo en lugar de perderse: para el
    estudio, cuántas propuestas no superaron la validación de cita es un dato
    sobre el comportamiento del agente.
    """
    result = engine.generate(request)
    known = {rid for rid, _ in request.baseline}

    accepted: list[ChangeProposal] = []
    rejected: list[RejectedDraft] = []

    for index, draft in enumerate(result.proposals, start=1):
        reason = _validate(draft, request.turns, known)
        if reason is not None:
            rejected.append(RejectedDraft(draft=draft, reason=reason))
            continue

        previous = next(
            (content for rid, content in request.baseline if rid == draft.target_id),
            None,
        )

        accepted.append(
            ChangeProposal(
                id=f"{id_prefix}-{request.iteration:02d}-{index:02d}",
                project_id=request.project_id,
                meeting_id=request.meeting_id,
                iteration=request.iteration,
                operation=draft.operation,
                target_id=draft.target_id,
                source_turn_ids=list(draft.source_turn_ids),
                content=draft.content,
                previous_content=previous if draft.operation != "create" else None,
                rationale=draft.rationale,
                signals=[
                    QualitySignal(rule=s.rule, label=s.label, detail=s.detail)
                    for s in draft.signals
                ],
                theme=draft.theme,
            )
        )
        # Un alta admitida ocupa su identificador para el resto del lote.
        if draft.operation == "create":
            known.add(draft.target_id)

    return GenerationOutcome(accepted=accepted, rejected=rejected, result=result)
