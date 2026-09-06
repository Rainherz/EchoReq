"""Voces de una reunión y quién es cada una.

La lista de voces se deriva de los turnos —no se guarda por separado, para
que no pueda quedar desincronizada— y la etiqueta que les pone el analista
vive en su propia tabla.
"""

from __future__ import annotations

from dataclasses import dataclass

from ...requirements.domain.transcription import seconds_from
from .pool import cursor

#: Cuántos turnos se ofrecen para escuchar por voz. Con tres alcanza para
#: reconocer a alguien; más vuelve la pantalla una transcripción entera.
SAMPLES = 3


@dataclass(frozen=True, slots=True)
class Sample:
    turn_id: int
    starts_at: str
    ends_at: str | None
    start_seconds: float
    end_seconds: float
    text: str


@dataclass(frozen=True, slots=True)
class Speaker:
    code: str
    #: Qué es esta voz en la reunión. Va al prompt y a las exportaciones.
    role: str | None
    #: Quién es. Existe para que el analista sepa a quién escuchó y no sale
    #: de la base: ni al modelo ni a los CSV del estudio.
    name: str | None
    turns: int
    characters: int
    samples: list[Sample]


def _sample(row) -> Sample:
    start = seconds_from(row["starts_at"])
    # Sin marca de fin —los turnos del fixture no la tienen— se ofrece una
    # ventana corta desde el inicio en lugar de no ofrecer nada.
    end = seconds_from(row["ends_at"]) if row["ends_at"] else start + 8.0
    return Sample(
        turn_id=row["turn_id"],
        starts_at=row["starts_at"],
        ends_at=row["ends_at"],
        start_seconds=start,
        end_seconds=end,
        text=row["text"],
    )


def for_meeting(meeting_id: str) -> list[Speaker]:
    """Voces distinguidas en la reunión, con turnos para escucharlas.

    Se ofrecen los turnos más largos de cada voz: reconocer a alguien por dos
    palabras sueltas es más difícil que por una oración entera, y quien
    etiqueta tiene que poder estar seguro.
    """
    with cursor() as cur:
        cur.execute(
            """
            SELECT t.speaker,
                   count(*)          AS turns,
                   sum(length(t.text)) AS characters,
                   l.role, l.name
            FROM turns t
            LEFT JOIN speaker_labels l
                   ON l.meeting_id = t.meeting_id AND l.code = t.speaker
            WHERE t.meeting_id = %s
            GROUP BY t.speaker, l.role, l.name
            ORDER BY t.speaker
            """,
            (meeting_id,),
        )
        voices = cur.fetchall()

        speakers: list[Speaker] = []
        for voice in voices:
            cur.execute(
                """
                SELECT turn_id, starts_at, ends_at, text
                FROM turns
                WHERE meeting_id = %s AND speaker = %s
                ORDER BY length(text) DESC, turn_id
                LIMIT %s
                """,
                (meeting_id, voice["speaker"], SAMPLES),
            )
            rows = sorted(cur.fetchall(), key=lambda r: r["turn_id"])
            speakers.append(
                Speaker(
                    code=voice["speaker"],
                    role=voice["role"],
                    name=voice["name"],
                    turns=voice["turns"],
                    characters=voice["characters"],
                    samples=[_sample(row) for row in rows],
                )
            )

    return speakers


def label(meeting_id: str, code: str, role: str, name: str | None = None) -> None:
    """Identifica una voz, o corrige lo que ya se había dicho de ella.

    Se puede pisar: es la interpretación de una persona, no la observación
    del modelo, y equivocarse al identificar una voz es esperable.
    """
    limpio = (name or "").strip()
    with cursor() as cur:
        cur.execute(
            """
            INSERT INTO speaker_labels (meeting_id, code, role, name)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (meeting_id, code)
            DO UPDATE SET role = EXCLUDED.role,
                          name = EXCLUDED.name,
                          updated_at = now()
            """,
            (meeting_id, code, role.strip(), limpio or None),
        )


def labels_for(meeting_id: str) -> dict[str, str]:
    """Mapa código → rol, para el prompt de generación.

    Va el rol y no el nombre a propósito: al agente le sirve saber que quien
    habla es el especialista o el entrevistador, no cómo se llama. Mandar el
    nombre metería datos identificados en cada llamada al modelo sin agregar
    nada a lo que tiene que decidir.
    """
    with cursor() as cur:
        cur.execute(
            "SELECT code, role FROM speaker_labels WHERE meeting_id = %s",
            (meeting_id,),
        )
        return {row["code"]: row["role"] for row in cur.fetchall()}
