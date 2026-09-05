"""Contrato de transcripción: del audio a los turnos citables.

El turno es la unidad de evidencia del estudio. El agente cita `turn_id` y el
revisor lee ese turno para juzgar la propuesta, así que dónde se corta un
turno decide qué se puede verificar después. Por eso la segmentación vive acá
y no en el adaptador: es una regla del estudio, no un detalle del
transcriptor.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, replace
from typing import Protocol

#: Silencio a partir del cual dos tramos del mismo hablante dejan de ser el
#: mismo turno.
TURN_GAP_SECONDS = 2.0

#: Duración máxima de un turno. El silencio solo no alcanza: en habla
#: espontánea las pausas de dos segundos casi no aparecen, y sin este tope una
#: persona que habla cinco minutos seguidos produce una sola cita de cinco
#: minutos.
#:
#: El número sale de para qué sirve el turno. El revisor lo lee entero para
#: verificar una propuesta; pasados unos tres cuartos de minuto deja de leer y
#: empieza a confiar. Y esa confianza por agotamiento es justo lo que el
#: estudio mide: si el instrumento la induce, deja de medirla.
MAX_TURN_SECONDS = 45.0

#: Tramo que la diarización no supo atribuir. Se marca, no se adivina: darle
#: un hablante inventado convertiría una duda en un dato.
UNKNOWN_SPEAKER = "S?"


@dataclass(frozen=True, slots=True)
class Segment:
    """Tramo de habla tal como lo entrega el transcriptor, antes de agrupar."""

    start: float
    end: float
    text: str
    speaker: str | None = None


@dataclass(frozen=True, slots=True)
class SpeakerSpan:
    """Tramo que la diarización atribuyó a una voz."""

    start: float
    end: float
    speaker: str


@dataclass(frozen=True, slots=True)
class TranscribedTurn:
    turn_id: int
    speaker: str
    starts_at: str
    ends_at: str
    text: str


@dataclass(frozen=True, slots=True)
class TranscriptionRequest:
    meeting_id: str
    audio_path: str
    #: `None` deja que el modelo detecte el idioma.
    language: str | None = None


@dataclass(frozen=True, slots=True)
class TranscriptionResult:
    turns: list[TranscribedTurn]
    language: str
    model_id: str
    #: Con qué se produjo. Se registra para poder descartar que la deriva
    #: medida entre iteraciones venga de haber cambiado de transcriptor.
    params: dict[str, object]


class TranscriptionEngine(Protocol):
    """Puerto de transcripción. El dominio no sabe que detrás hay WhisperX."""

    def transcribe(self, request: TranscriptionRequest) -> TranscriptionResult: ...


def timestamp(seconds: float) -> str:
    """Marca de tiempo legible, en el mismo formato que usa la transcripción.

    Se omiten las horas mientras no hagan falta: una entrevista de cuarenta
    minutos se lee mejor como `11:58` que como `0:11:58`.
    """
    total = max(0, int(seconds))
    hours, rest = divmod(total, 3600)
    minutes, secs = divmod(rest, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def into_turns(segments: Sequence[Segment]) -> list[TranscribedTurn]:
    """Agrupa los tramos en turnos de conversación.

    Dos tramos son el mismo turno si los dijo el mismo hablante, entre ellos
    no hubo más silencio que `TURN_GAP_SECONDS`, y el turno resultante no pasa
    de `MAX_TURN_SECONDS`. El corte por duración cae siempre en un borde de
    tramo, que es una pausa detectada: nunca parte una oración al medio.

    Los identificadores se asignan por orden y arrancan en 1: son los que van
    a quedar citados en las propuestas, así que no pueden depender de en qué
    orden llegaron los datos.

    Los hablantes se renumeran a `S1`, `S2`… por orden de aparición. La
    diarización distingue voces, no personas: quién es cada quién es una
    decisión del analista, no del modelo.
    """
    labels: dict[str, str] = {}
    grouped: list[list[Segment]] = []

    for segment in segments:
        text = segment.text.strip()
        if not text:
            continue

        speaker = (
            UNKNOWN_SPEAKER
            if segment.speaker is None
            else labels.setdefault(segment.speaker, f"S{len(labels) + 1}")
        )
        current = replace(segment, text=text, speaker=speaker)

        open_turn = grouped[-1] if grouped else None
        continues = (
            open_turn is not None
            and open_turn[-1].speaker == speaker
            and current.start - open_turn[-1].end <= TURN_GAP_SECONDS
            and current.end - open_turn[0].start <= MAX_TURN_SECONDS
        )
        if continues and open_turn is not None:
            open_turn.append(current)
        else:
            grouped.append([current])

    return [
        TranscribedTurn(
            turn_id=index,
            speaker=parts[0].speaker or UNKNOWN_SPEAKER,
            starts_at=timestamp(parts[0].start),
            ends_at=timestamp(parts[-1].end),
            text=" ".join(part.text for part in parts),
        )
        for index, parts in enumerate(grouped, start=1)
    ]


def assign_speakers(
    segments: Sequence[Segment], spans: Sequence[SpeakerSpan]
) -> list[Segment]:
    """Atribuye cada tramo a la voz con la que más se solapa en el tiempo.

    El reconocimiento y la diarización corren por separado y cortan distinto:
    uno segmenta por frase, el otro por voz. Cruzarlos por solapamiento máximo
    es lo que los reconcilia.

    Un tramo que no se solapa con ninguna voz queda sin atribuir. Asignarlo al
    hablante más cercano sería inventar: en una entrevista, el habla que la
    diarización no capturó suele ser justo la superpuesta, y ahí es donde
    equivocarse cambia quién pidió qué.
    """
    attributed: list[Segment] = []

    for segment in segments:
        best: str | None = None
        best_overlap = 0.0

        for span in spans:
            overlap = min(segment.end, span.end) - max(segment.start, span.start)
            if overlap > best_overlap:
                best_overlap = overlap
                best = span.speaker

        attributed.append(replace(segment, speaker=best))

    return attributed
