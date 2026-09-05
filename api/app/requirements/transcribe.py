"""Transcribir una reunión: reglas del estudio alrededor del modelo."""

from __future__ import annotations

from .domain.transcription import (
    TranscriptionEngine,
    TranscriptionRequest,
    TranscriptionResult,
)


class NotTranscribable(Exception):
    """La reunión no está en condiciones de transcribirse."""


def ensure_transcribable(audio) -> None:
    """Verifica que la reunión pueda transcribirse, sin tocar el audio.

    Se expone aparte para que quien vaya a transcribir pueda preguntarlo
    antes de cargar los modelos: no tiene sentido pedir un token de
    HuggingFace y esperar a que baje `large-v3` para recién ahí descubrir que
    la reunión ya estaba transcripta.
    """
    if audio.path is None:
        raise NotTranscribable(
            f"La reunión {audio.meeting_id} no tiene audio cargado. Subilo primero."
        )

    if audio.turn_count > 0:
        raise NotTranscribable(
            f"La reunión {audio.meeting_id} ya tiene {audio.turn_count} turnos. "
            "La transcripción no se rehace: las decisiones ya registradas los "
            "citan por número."
        )


def run_transcription(
    engine: TranscriptionEngine,
    store,
    meeting_id: str,
    language: str | None = None,
) -> TranscriptionResult:
    """Transcribe la reunión y deja los turnos en la base.

    Se transcribe una sola vez. `turns` es de solo anexado y no por capricho:
    una decisión ya registrada puede citar el turno 44, y volver a transcribir
    reasignaría ese número a otro tramo del audio. La cita quedaría apuntando
    a algo que nadie dijo, y nada en la base lo delataría. Para rehacer una
    transcripción hay que crear otra reunión.
    """
    audio = store.load(meeting_id)
    ensure_transcribable(audio)

    store.mark_running(meeting_id)
    try:
        result = engine.transcribe(
            TranscriptionRequest(
                meeting_id=meeting_id,
                audio_path=audio.path,
                language=language,
            )
        )
    except Exception as cause:
        store.mark_failed(meeting_id, f"{type(cause).__name__}: {cause}")
        raise

    if not result.turns:
        store.mark_failed(meeting_id, "El audio no produjo ningún turno.")
        raise NotTranscribable(
            "El audio no produjo ningún turno. Revisá que tenga habla audible."
        )

    store.store_turns(meeting_id, result)
    return result
