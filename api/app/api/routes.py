"""Rutas HTTP."""

from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, HTTPException, Query

from ..adapters.persistence.repositories import (
    AlreadyDecided,
    PostgresDecisionRepository,
    PostgresDocumentRepository,
    PostgresProposalRepository,
    PostgresTranscriptRepository,
)
from ..requirements.domain.entities import ReviewDecision
from ..requirements.use_cases import ReviewQueue, SpecificationReader, StudyMetrics
from .schemas import (
    DecisionIn,
    DecisionOut,
    DocumentEntryOut,
    DriftOut,
    MetricsOut,
    ProposalOut,
    RevisionOut,
)

router = APIRouter(prefix="/api")

_proposals = PostgresProposalRepository()
_decisions = PostgresDecisionRepository()
_documents = PostgresDocumentRepository()
_transcripts = PostgresTranscriptRepository()

_queue = ReviewQueue(_proposals, _transcripts, _decisions)
_spec = SpecificationReader(_documents)
_metrics = StudyMetrics(_decisions)


@router.get("/projects/{project_id}/iterations/{iteration}/queue")
def review_queue(
    project_id: str, iteration: int, participant: str = Query(...)
) -> list[ProposalOut]:
    """Propuestas pendientes de la iteración, con el contexto de cada cita."""
    return [
        ProposalOut(
            id=item.proposal.id,
            iteration=item.proposal.iteration,
            operation=item.proposal.operation,
            target_id=item.proposal.target_id,
            content=item.proposal.content,
            previous_content=item.proposal.previous_content,
            source_turn_ids=item.proposal.source_turn_ids,
            rationale=item.proposal.rationale,
            signals=[asdict(s) for s in item.proposal.signals],
            theme=item.proposal.theme,
            context_turns=[
                {
                    "id": turn.turn_id,
                    "meeting_id": turn.meeting_id,
                    "speaker": turn.speaker,
                    "starts_at": turn.starts_at,
                    "text": turn.text,
                }
                for turn in item.context_turns
            ],
        )
        for item in _queue.pending(project_id, iteration, participant)
    ]


@router.post("/review-decisions", status_code=201)
def record_decision(payload: DecisionIn) -> DecisionOut:
    try:
        decision = ReviewDecision(
            proposal_id=payload.proposal_id,
            participant_id=payload.participant_id,
            action=payload.action,  # type: ignore[arg-type]
            presented_at=payload.presented_at,
            decided_at=payload.decided_at,
            edited_content=payload.edited_content,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        decision_id = _queue.record(decision)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except AlreadyDecided as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    return DecisionOut(id=decision_id, seconds=round(decision.seconds, 3))


@router.get("/projects/{project_id}/document")
def document(project_id: str, revision: int = Query(...)) -> list[DocumentEntryOut]:
    return [
        DocumentEntryOut(**asdict(entry)) for entry in _spec.at(project_id, revision)
    ]


@router.get("/projects/{project_id}/requirements/{requirement_id}/history")
def history(project_id: str, requirement_id: str) -> list[RevisionOut]:
    rows = _spec.history(project_id, requirement_id)
    if not rows:
        raise HTTPException(status_code=404, detail=f"{requirement_id} no existe.")
    return [
        RevisionOut(
            requirement_id=row.requirement_id,
            revision=row.revision,
            meeting_id=row.meeting_id,
            operation=row.operation,
            content=row.content,
            source_turn_ids=row.source_turn_ids,
            summary=row.summary,
        )
        for row in rows
    ]


@router.get("/projects/{project_id}/metrics")
def metrics(project_id: str) -> list[MetricsOut]:
    """Cifras de H2 y H3 por iteración."""
    return [MetricsOut(**asdict(m)) for m in _metrics.by_iteration(project_id)]


@router.get("/projects/{project_id}/drift")
def drift(project_id: str) -> list[DriftOut]:
    """Deriva sintáctica por revisión. Determinista, sin modelo."""
    return [DriftOut(**row) for row in _spec.drift_by_revision(project_id)]
