"""Rutas HTTP."""

from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, HTTPException, Query
from fastapi import Response

from ..adapters.persistence.exports import DATASETS, row_count, to_csv
from ..adapters.persistence.repositories import (
    AlreadyCorrected,
    AlreadyDecided,
    PostgresCatalogRepository,
    PostgresDecisionRepository,
    PostgresDocumentRepository,
    PostgresProposalRepository,
    PostgresTranscriptRepository,
)
from ..requirements.domain.entities import DecisionCorrection, ReviewDecision
from ..requirements.use_cases import ReviewQueue, SpecificationReader, StudyMetrics
from .schemas import (
    DecisionIn,
    CorrectionIn,
    CorrectionOut,
    DecisionOut,
    DocumentEntryOut,
    DriftOut,
    MeetingOut,
    MetricsOut,
    ProjectOut,
    DatasetOut,
    ProposalOut,
    RejectionOut,
    RevisionOut,
)

router = APIRouter(prefix="/api")

_proposals = PostgresProposalRepository()
_decisions = PostgresDecisionRepository()
_documents = PostgresDocumentRepository()
_transcripts = PostgresTranscriptRepository()
_catalog = PostgresCatalogRepository()

_queue = ReviewQueue(_proposals, _transcripts, _decisions)
_spec = SpecificationReader(_documents)
_metrics = StudyMetrics(_decisions)


@router.get("/projects")
def projects() -> list[ProjectOut]:
    return [ProjectOut(**asdict(row)) for row in _catalog.projects()]


@router.get("/projects/{project_id}/meetings")
def meetings(project_id: str, participant: str = Query(...)) -> list[MeetingOut]:
    """Reuniones del proyecto, con cuántas propuestas le quedan al participante."""
    rows = _catalog.meetings(project_id, participant)
    if not rows:
        raise HTTPException(status_code=404, detail=f"No hay reuniones en {project_id}.")
    return [
        MeetingOut(
            id=m.id,
            iteration=m.iteration,
            label=m.label,
            mode=m.mode,
            held_at=m.held_at,
            has_consent=m.has_consent,
            turn_count=m.turn_count,
            pending_proposals=m.pending_proposals,
        )
        for m in rows
    ]


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


@router.post("/decision-corrections", status_code=201)
def correct_decision(payload: CorrectionIn) -> CorrectionOut:
    """Marca una decisión como error de registro.

    No borra ni modifica la original: la decisión y su intervalo siguen en los
    datos. Solo se puede corregir una vez, y el motivo es obligatorio, para
    que corregir no funcione como un deshacer.
    """
    try:
        correction = DecisionCorrection(
            decision_id=payload.decision_id,
            participant_id=payload.participant_id,
            intended_action=payload.intended_action,  # type: ignore[arg-type]
            reason=payload.reason,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        return CorrectionOut(id=_decisions.correct(correction))
    except AlreadyCorrected as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/projects/{project_id}/document")
def document(project_id: str, revision: int = Query(...)) -> list[DocumentEntryOut]:
    return [
        DocumentEntryOut(**asdict(entry)) for entry in _spec.at(project_id, revision)
    ]


@router.get("/projects/{project_id}/revisions")
def revisions(project_id: str) -> list[RevisionOut]:
    """Log completo de revisiones del proyecto.

    Alimenta la matriz de trazabilidad, que necesita ver todas las filas y no
    el documento derivado.
    """
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
        for row in _documents.revisions(project_id)
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


@router.get("/projects/{project_id}/rejections")
def rejections(project_id: str) -> list[RejectionOut]:
    """Propuestas que se rechazaron.

    Una propuesta rechazada no deja texto en la especificación, pero la
    ausencia es un dato del estudio: se discutió, se descartó, y ahora no
    existe en ningún lado. La matriz de trazabilidad tiene que poder
    mostrarla.
    """
    return [RejectionOut(**asdict(row)) for row in _decisions.rejections(project_id)]


@router.get("/projects/{project_id}/metrics")
def metrics(project_id: str) -> list[MetricsOut]:
    """Cifras de H2 y H3 por iteración."""
    return [MetricsOut(**asdict(m)) for m in _metrics.by_iteration(project_id)]


@router.get("/projects/{project_id}/drift")
def drift(project_id: str) -> list[DriftOut]:
    """Deriva sintáctica por revisión. Determinista, sin modelo."""
    return [DriftOut(**row) for row in _spec.drift_by_revision(project_id)]


@router.get("/projects/{project_id}/export")
def datasets(project_id: str) -> list[DatasetOut]:
    """Conjuntos disponibles, con su diccionario de datos y cantidad de filas."""
    return [
        DatasetOut(
            name=dataset.name,
            title=dataset.title,
            purpose=dataset.purpose,
            columns=[
                {"name": column, "meaning": meaning}
                for column, meaning in dataset.codebook.items()
            ],
            rows=row_count(dataset, project_id),
        )
        for dataset in DATASETS.values()
    ]


@router.get("/projects/{project_id}/export/{name}.csv", response_model=None)
def export_csv(project_id: str, name: str) -> Response:
    """Descarga un conjunto como CSV.

    Se sirve con Content-Disposition para que el navegador lo baje como
    archivo en lugar de mostrarlo.
    """
    dataset = DATASETS.get(name)
    if dataset is None:
        raise HTTPException(status_code=404, detail=f"No existe el conjunto {name}.")

    return Response(
        content=to_csv(dataset, project_id),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{project_id}-{name}.csv"'
            )
        },
    )
