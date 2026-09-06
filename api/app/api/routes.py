"""Rutas HTTP."""

from __future__ import annotations

import subprocess
from dataclasses import asdict

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi import Response

from ..adapters.persistence import speakers
from ..adapters.persistence import transcript_store
from ..adapters.persistence.exports import DATASETS, row_count, to_csv
from ..adapters.storage import audio as audio_store
from ..adapters.persistence.repositories import (
    DuplicateParticipant,
    PostgresParticipantRepository,
    AlreadyCorrected,
    AlreadyDecided,
    DuplicateProject,
    PostgresCatalogRepository,
    PostgresDecisionRepository,
    PostgresMeetingRepository,
    PostgresDocumentRepository,
    PostgresProposalRepository,
    PostgresTranscriptRepository,
)
from ..requirements.domain.entities import DecisionCorrection, ReviewDecision
from ..requirements.use_cases import ReviewQueue, SpecificationReader, StudyMetrics
from .schemas import (
    SpeakerIn,
    SpeakerOut,
    SpeakerSampleOut,
    ParticipantIn,
    ParticipantOut,
    DecisionIn,
    CorrectionIn,
    CorrectionOut,
    DecisionOut,
    DocumentEntryOut,
    DriftOut,
    MeetingAudioOut,
    MeetingIn,
    MeetingOut,
    MetricsOut,
    ProjectIn,
    ProjectOut,
    DatasetOut,
    ProposalOut,
    RejectionOut,
    TurnOut,
    RevisionOut,
)

router = APIRouter(prefix="/api")

_proposals = PostgresProposalRepository()
_decisions = PostgresDecisionRepository()
_documents = PostgresDocumentRepository()
_transcripts = PostgresTranscriptRepository()
_catalog = PostgresCatalogRepository()
_meetings_repo = PostgresMeetingRepository()
_participants = PostgresParticipantRepository()

#: Tope del recorte de audio. Alcanza para reconocer una voz y evita que el
#: endpoint se vuelva una vía para descargar la reunión entera de a pedazos.
MAX_CLIP_SECONDS = 45.0

# El documento se pasa a la cola porque una decisión aprobada lo modifica:
# aceptar una propuesta es escribir la especificación, no solo anotar que
# alguien la miró.
_queue = ReviewQueue(_proposals, _transcripts, _decisions, _documents)
_spec = SpecificationReader(_documents)
_metrics = StudyMetrics(_decisions)


@router.get("/participants")
def participants() -> list[ParticipantOut]:
    """Quiénes pueden revisar.

    La lista es del instrumento, no de un proyecto: un mismo revisor puede
    aparecer en varias cadenas y sus series se comparan entre sí.
    """
    return [ParticipantOut(**asdict(p)) for p in _participants.all()]


@router.post("/participants", status_code=201)
def create_participant(payload: ParticipantIn) -> ParticipantOut:
    try:
        created = _participants.create(payload.display_name, payload.role)
    except DuplicateParticipant as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return ParticipantOut(**asdict(created))


@router.get("/projects")
def projects() -> list[ProjectOut]:
    return [ProjectOut(**asdict(row)) for row in _catalog.projects()]


@router.post("/projects", status_code=201)
def create_project(payload: ProjectIn) -> ProjectOut:
    """Crea un workspace.

    El formato se fija acá y no por reunión: la cadena que se mide usa uno
    solo, porque cada formato se evalúa con criterios de calidad distintos y
    mezclarlos haría incomparables las curvas de deriva.
    """
    try:
        project = _catalog.create_project(
            payload.name, payload.format, payload.domain
        )
    except DuplicateProject as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return ProjectOut(**asdict(project))


@router.get("/projects/{project_id}/meetings")
def meetings(project_id: str, participant: str = Query(...)) -> list[MeetingOut]:
    """Reuniones del proyecto, con cuántas propuestas le quedan al participante."""
    # Un proyecto recién creado no tiene reuniones. Eso es un estado válido,
    # no un error: la interfaz muestra el vacío y ofrece crear la primera.
    return [MeetingOut(**asdict(m)) for m in _catalog.meetings(project_id, participant)]


@router.post("/projects/{project_id}/meetings", status_code=201)
def create_meeting(project_id: str, payload: MeetingIn) -> MeetingOut:
    """Crea la próxima reunión del proyecto.

    La iteración y el modo se derivan: son reglas del estudio, no opciones.
    """
    if not _catalog.project_exists(project_id):
        raise HTTPException(
            status_code=404, detail=f"No existe el proyecto {project_id}."
        )

    meeting_id = _meetings_repo.create(project_id, payload.label, payload.held_at)
    created = next(
        m for m in _catalog.meetings(project_id, payload.participant_id)
        if m.id == meeting_id
    )
    return MeetingOut(**asdict(created))


@router.post("/meetings/{meeting_id}/consent", status_code=204)
def record_consent(meeting_id: str) -> None:
    """Deja constancia del consentimiento de los participantes.

    Es condición para procesar la sesión: grabar personas sin registrarlo
    está fuera del protocolo del estudio.
    """
    try:
        _meetings_repo.record_consent(meeting_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/meetings/{meeting_id}/audio", status_code=201)
def upload_audio(meeting_id: str, file: UploadFile = File(...)) -> MeetingAudioOut:
    """Carga el audio de una reunión.

    El archivo se guarda en disco con su hash; la base guarda dónde está y
    con qué verificarlo. La transcripción queda pendiente: es otro paso.
    """
    # Se verifica la reunión antes de escribir: si no, una subida a un
    # identificador inexistente deja el archivo huérfano en el disco.
    if not _meetings_repo.exists(meeting_id):
        raise HTTPException(
            status_code=404, detail=f"No existe la reunión {meeting_id}."
        )

    try:
        stored = audio_store.store(meeting_id, file.filename or "", file.file)
    except audio_store.RejectedAudio as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    _meetings_repo.attach_audio(
        meeting_id,
        filename=stored.filename,
        path=stored.path,
        size_bytes=stored.size_bytes,
        sha256=stored.sha256,
    )

    return MeetingAudioOut(
        filename=stored.filename,
        size_bytes=stored.size_bytes,
        sha256=stored.sha256,
        transcription_status="pending",
    )


@router.get("/meetings/{meeting_id}/speakers")
def meeting_speakers(meeting_id: str) -> list[SpeakerOut]:
    """Voces de la reunión, con turnos para escucharlas y quién es cada una."""
    if not _meetings_repo.exists(meeting_id):
        raise HTTPException(
            status_code=404, detail=f"No existe la reunión {meeting_id}."
        )
    return [
        SpeakerOut(
            code=voice.code,
            role=voice.role,
            name=voice.name,
            turns=voice.turns,
            characters=voice.characters,
            samples=[SpeakerSampleOut(**asdict(sample)) for sample in voice.samples],
        )
        for voice in speakers.for_meeting(meeting_id)
    ]


@router.put("/meetings/{meeting_id}/speakers/{code}", status_code=204)
def label_speaker(meeting_id: str, code: str, payload: SpeakerIn) -> None:
    """Nombra una voz, o corrige el nombre que tenía.

    Se puede pisar a diferencia de la transcripción: quién es cada voz es la
    interpretación de una persona, no lo que observó el modelo.
    """
    if not _meetings_repo.exists(meeting_id):
        raise HTTPException(
            status_code=404, detail=f"No existe la reunión {meeting_id}."
        )
    speakers.label(meeting_id, code, payload.role, payload.name)


@router.get("/meetings/{meeting_id}/audio/clip", response_model=None)
def audio_clip(
    meeting_id: str,
    start: float = Query(ge=0),
    seconds: float = Query(default=10.0, gt=0, le=MAX_CLIP_SECONDS),
) -> Response:
    """Un recorte del audio, para reconocer una voz.

    Se recorta en el servidor en lugar de servir el archivo entero: la
    reunión pesa decenas de megabytes y de acá solo se necesitan segundos.
    La ruta sale de la base, nunca del pedido.
    """
    audio = transcript_store.load(meeting_id)
    if audio.path is None:
        raise HTTPException(
            status_code=404, detail=f"La reunión {meeting_id} no tiene audio."
        )

    try:
        cut = subprocess.run(
            ["ffmpeg", "-v", "error", "-ss", str(start), "-t", str(seconds),
             "-i", audio.path, "-ac", "1", "-f", "wav", "-"],
            capture_output=True,
            timeout=30,
            check=True,
        )
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail="Falta ffmpeg en el servidor; sin él no se puede recortar el audio.",
        ) from exc
    except subprocess.CalledProcessError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"ffmpeg falló: {exc.stderr.decode()[:200]}",
        ) from exc

    return Response(content=cut.stdout, media_type="audio/wav")


@router.get("/meetings/{meeting_id}/turns")
def meeting_turns(meeting_id: str) -> list[TurnOut]:
    """Transcripción completa. Descubrimiento la lee entera, no por ventana."""
    turns = _transcripts.turns_for_meeting(meeting_id)
    # Una reunión sin transcribir todavía no tiene turnos, y eso es un estado
    # normal del recorrido, no un recurso faltante. Devolver 404 hacía que la
    # interfaz mostrara un error mientras el pipeline todavía no corrió.
    if not turns and not _meetings_repo.exists(meeting_id):
        raise HTTPException(
            status_code=404, detail=f"No existe la reunión {meeting_id}."
        )
    return [
        TurnOut(
            id=t.turn_id,
            meeting_id=t.meeting_id,
            speaker=t.speaker,
            starts_at=t.starts_at,
            text=t.text,
        )
        for t in turns
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
