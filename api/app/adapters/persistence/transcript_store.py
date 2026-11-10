"""Audio de una reunión y escritura de su transcripción.

Los turnos se escriben por acá vengan del audio (`store_turns`) o de un
archivo importado (`store_imported_turns`): la misma inserción, la misma
regla de solo anexado.
"""

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
    has_consent: bool = False
    #: `txt` o `vtt` si los turnos salieron de un archivo importado.
    transcript_format: str | None = None


def load(meeting_id: str) -> MeetingAudio:
    with cursor() as cur:
        cur.execute(
            """
            SELECT m.id, m.label, m.audio_path, m.audio_sha256,
                   m.transcription_status, m.transcript_format,
                   (m.consent_at IS NOT NULL) AS has_consent,
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
        has_consent=row["has_consent"],
        transcript_format=row["transcript_format"],
    )


def stored_turns(meeting_id: str):
    """Turnos ya guardados, para mapear una diarización posterior contra ellos."""
    from ...requirements.domain.transcription import TranscribedTurn

    with cursor() as cur:
        cur.execute(
            "SELECT turn_id, speaker, starts_at, ends_at, text FROM turns "
            "WHERE meeting_id = %s ORDER BY turn_id",
            (meeting_id,),
        )
        return [TranscribedTurn(**row) for row in cur.fetchall()]


def store_voiceprints(meeting_id: str, prints) -> int:
    """Guarda las huellas de una reunión ya transcripta.

    No pisa las que ya estén: una huella es una observación del modelo sobre
    ese audio, y volver a calcularla no la mejora.
    """
    if not prints:
        return 0
    with cursor() as cur:
        cur.executemany(
            "INSERT INTO speaker_voiceprints (meeting_id, code, embedding) "
            "VALUES (%s, %s, %s) ON CONFLICT (meeting_id, code) DO NOTHING",
            [(meeting_id, v.code, str(v.embedding)) for v in prints],
        )
        return cur.rowcount


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

        _insert_turns(cur, meeting_id, result.turns)
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


def _insert_turns(cur, meeting_id: str, turns) -> None:
    cur.executemany(
        "INSERT INTO turns (meeting_id, turn_id, speaker, starts_at, ends_at, text) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        [
            (
                meeting_id,
                turn.turn_id,
                turn.speaker,
                turn.starts_at,
                getattr(turn, "ends_at", None),
                turn.text,
            )
            for turn in turns
        ],
    )


def store_imported_turns(meeting_id: str, turns, transcript, fmt: str) -> int:
    """Anexa los turnos de un archivo importado y cierra la transcripción.

    La regla de una sola fuente se vuelve a verificar acá, con la fila
    bloqueada: entre la verificación del caso de uso y esta escritura pudo
    llegar otra importación o terminar una transcripción del audio.

    La procedencia queda como `transcription_model = 'import'`: estos turnos
    no salieron de ningún modelo, y decir otra cosa contaminaría la
    comparación entre iteraciones que la columna existe para proteger.
    """
    from ...requirements.domain.transcript_import import NotImportable

    with cursor() as cur:
        cur.execute(
            """
            SELECT m.audio_path, m.transcription_status,
                   EXISTS (SELECT 1 FROM turns t WHERE t.meeting_id = m.id) AS has_turns
            FROM meetings m WHERE m.id = %s FOR UPDATE
            """,
            (meeting_id,),
        )
        row = cur.fetchone()
        if row is None:
            raise LookupError(f"No existe la reunión {meeting_id}.")
        if row["has_turns"] or row["audio_path"] is not None or row["transcription_status"] == "running":
            raise NotImportable(
                f"La reunión {meeting_id} ya tiene turnos o audio. Los turnos "
                "salen de una sola fuente: creá otra reunión."
            )

        _insert_turns(cur, meeting_id, turns)
        cur.execute(
            """
            UPDATE meetings
            SET transcription_status = 'done',
                transcription_error = NULL,
                transcription_model = 'import',
                transcription_params = %s,
                transcribed_at = now(),
                transcript_filename = %s,
                transcript_path = %s,
                transcript_sha256 = %s,
                transcript_format = %s
            WHERE id = %s
            """,
            (
                Json({"format": fmt, "parser": "transcript_import"}),
                transcript.filename,
                transcript.path,
                transcript.sha256,
                fmt,
                meeting_id,
            ),
        )

    return len(turns)
