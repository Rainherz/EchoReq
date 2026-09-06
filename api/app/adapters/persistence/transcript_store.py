"""Audio de una reunión y escritura de su transcripción."""

from __future__ import annotations

from dataclasses import dataclass

from psycopg.types.json import Json

from ...requirements.domain.transcription import TranscriptionResult
from .pool import cursor


@dataclass(frozen=True, slots=True)
class MeetingAudio:
    meeting_id: str
    label: str
    path: str | None
    sha256: str | None
    status: str
    turn_count: int


def load(meeting_id: str) -> MeetingAudio:
    with cursor() as cur:
        cur.execute(
            """
            SELECT m.id, m.label, m.audio_path, m.audio_sha256,
                   m.transcription_status,
                   (SELECT count(*) FROM turns t WHERE t.meeting_id = m.id) AS turns
            FROM meetings m WHERE m.id = %s
            """,
            (meeting_id,),
        )
        row = cur.fetchone()

    if row is None:
        raise LookupError(f"No existe la reunión {meeting_id}.")

    return MeetingAudio(
        meeting_id=row["id"],
        label=row["label"],
        path=row["audio_path"],
        sha256=row["audio_sha256"],
        status=row["transcription_status"],
        turn_count=row["turns"],
    )


def mark_running(meeting_id: str) -> None:
    with cursor() as cur:
        cur.execute(
            "UPDATE meetings SET transcription_status = 'running', "
            "transcription_error = NULL WHERE id = %s",
            (meeting_id,),
        )


def mark_failed(meeting_id: str, error: str) -> None:
    """Deja el motivo en la base.

    La falla se guarda en lugar de volver a 'pending' porque un fracaso
    silencioso se confunde con una reunión que todavía no se procesó, y la
    interfaz mostraría las dos igual.
    """
    with cursor() as cur:
        cur.execute(
            "UPDATE meetings SET transcription_status = 'failed', "
            "transcription_error = %s WHERE id = %s",
            (error[:2000], meeting_id),
        )


def store_turns(meeting_id: str, result: TranscriptionResult) -> int:
    """Anexa los turnos y cierra la transcripción, todo en una transacción.

    O quedan los turnos completos con su procedencia, o no queda nada: una
    transcripción a medias dejaría propuestas citando turnos que no existen.
    """
    params = dict(result.params)
    params["language"] = result.language

    with cursor() as cur:
        # Las huellas van en la misma transacción que los turnos: una voz
        # guardada sin sus turnos, o al revés, dejaría el reconocimiento
        # apuntando a una reunión que no se puede leer.
        if result.voiceprints:
            cur.executemany(
                "INSERT INTO speaker_voiceprints (meeting_id, code, embedding) "
                "VALUES (%s, %s, %s) "
                "ON CONFLICT (meeting_id, code) DO NOTHING",
                [
                    (meeting_id, v.code, str(v.embedding))
                    for v in result.voiceprints
                ],
            )

        cur.executemany(
            "INSERT INTO turns (meeting_id, turn_id, speaker, starts_at, ends_at, text) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            [
                (
                    meeting_id,
                    turn.turn_id,
                    turn.speaker,
                    turn.starts_at,
                    turn.ends_at,
                    turn.text,
                )
                for turn in result.turns
            ],
        )
        cur.execute(
            """
            UPDATE meetings
            SET transcription_status = 'done',
                transcription_error = NULL,
                transcription_model = %s,
                transcription_params = %s,
                transcribed_at = now()
            WHERE id = %s
            """,
            (result.model_id, Json(params), meeting_id),
        )

    return len(result.turns)
