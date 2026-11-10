"""Transcripción en texto → turnos.

Dos formatos de entrada:

``txt``  Una intervención por línea, ``Hablante: texto``. Admite una marca de
         tiempo opcional al inicio (``[12:04] Hablante: texto``), comentarios
         con ``#`` y pausas ``[pausa 1.5]`` (las ignora). Una línea sin
         hablante continúa la intervención anterior.

``vtt``  WebVTT, como lo exportan Meet, Teams o Zoom. El hablante sale de la
         etiqueta ``<v Nombre>`` (Teams) o del prefijo ``Nombre:`` (Meet, Zoom).

**Qué es un turno.** Una racha continua de un mismo hablante. Teams parte una
intervención en varios cues de pocos segundos; si cada cue fuera un turno, el
número de turnos —y por lo tanto lo que el agente cita— dependería de la
plataforma y no de la conversación. Por eso los cues o líneas consecutivas de
un mismo hablante se unen en un solo turno, en los dos formatos.

Es dominio puro: no toca la base ni el disco, y la misma función la usan la
API y el script de línea de comandos. Es la alternativa al audio
(`transcription.py`): una reunión toma sus turnos de una sola de las dos.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass
from typing import Literal

Kind = Literal["txt", "vtt"]

#: Tope del archivo. Una reunión de dos horas transcrita ronda los 150 KB.
MAX_BYTES = 5 * 1024 * 1024

_PAUSE = re.compile(r"^\[pausa\s+[\d.]+\]$", re.I)
_STAMP = r"(?:\[?(?P<stamp>(?:\d{1,2}:)?\d{1,2}:\d{2})(?:[.,]\d+)?\]?\s+)?"
# Hablante: hasta 40 caracteres y 4 palabras, sin ':'. El límite de palabras
# evita leer como hablante el comienzo de una frase («Y entonces me dijo: …»).
_TXT_LINE = re.compile(_STAMP + r"(?P<speaker>[^:\[\]]{1,40}?)\s*:\s+(?P<text>.+)$")
_TXT_STAMP_ONLY = re.compile(r"^" + _STAMP + r"(?P<text>.*)$")
_CUE_TIME = re.compile(
    r"^(?P<start>(?:\d+:)?\d{1,2}:\d{2}[.,]\d{3})\s+-->\s+(?:\d+:)?\d{1,2}:\d{2}[.,]\d{3}"
)
_VOICE = re.compile(r"<v(?:\.[^\s>]+)*\s+(?P<speaker>[^>]+)>(?P<text>.*?)(?:</v>|$)", re.S)
_TAG = re.compile(r"</?[^>]+>")


class TranscriptError(ValueError):
    """El archivo no se puede convertir en turnos. El mensaje dice por qué."""


class NotImportable(Exception):
    """La reunión no puede recibir una transcripción importada.

    Falta el consentimiento, o sus turnos ya salen de otra fuente: los turnos
    de una reunión vienen del audio o de un archivo, nunca de los dos.
    """


@dataclass(frozen=True, slots=True)
class ParsedTurn:
    turn_id: int
    speaker: str
    starts_at: str
    text: str


def kind_for(filename: str) -> Kind:
    name = filename.lower()
    if name.endswith(".vtt"):
        return "vtt"
    if name.endswith(".txt"):
        return "txt"
    raise TranscriptError("La transcripción tiene que ser .txt o .vtt.")


def decode(raw: bytes) -> str:
    if len(raw) > MAX_BYTES:
        raise TranscriptError("La transcripción supera 5 MB.")
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        # El Bloc de notas de Windows todavía guarda en ANSI por defecto.
        return raw.decode("cp1252")


def parse(text: str, kind: Kind) -> list[ParsedTurn]:
    raw_turns = _parse_vtt(text) if kind == "vtt" else _parse_txt(text)
    turns = _merge(raw_turns)
    if len(turns) < 2:
        raise TranscriptError(
            "La transcripción tiene menos de dos turnos: no hay conversación que analizar."
        )
    return turns


# ----------------------------------------------------------------------- txt
def _parse_txt(text: str) -> list[tuple[str, str, str]]:
    turns: list[list[str]] = []
    for number, line in enumerate(text.splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#") or _PAUSE.match(line):
            continue

        match = _TXT_LINE.match(line)
        if match and len(match["speaker"].split()) <= 4:
            turns.append(
                [match["speaker"].strip(), _stamp(match["stamp"]), match["text"].strip()]
            )
            continue

        # Sin hablante: continúa la intervención anterior.
        if not turns:
            raise TranscriptError(
                f"Línea {number}: no se reconoce el hablante. "
                "Cada intervención va como «Hablante: texto»."
            )
        rest = _TXT_STAMP_ONLY.match(line)
        turns[-1][2] += " " + (rest["text"] if rest else line).strip()

    return [(s, t, x) for s, t, x in turns]


# ----------------------------------------------------------------------- vtt
def _parse_vtt(text: str) -> list[tuple[str, str, str]]:
    blocks = re.split(r"\n\s*\n", text.replace("\r\n", "\n").strip())
    if not blocks or not blocks[0].lstrip().startswith("WEBVTT"):
        raise TranscriptError("El archivo .vtt no empieza con «WEBVTT».")

    turns: list[tuple[str, str, str]] = []
    unnamed = 0
    for block in blocks[1:]:
        lines = block.strip().split("\n")
        if lines[0].startswith(("NOTE", "STYLE", "REGION")):
            continue
        timing_at = next((i for i, l in enumerate(lines) if _CUE_TIME.match(l)), None)
        if timing_at is None:
            continue
        start = _stamp(_CUE_TIME.match(lines[timing_at])["start"])  # type: ignore[index]
        payload = "\n".join(lines[timing_at + 1 :]).strip()
        if not payload:
            continue

        voices = list(_VOICE.finditer(payload))
        if voices:
            for voice in voices:
                turns.append((voice["speaker"].strip(), start, _clean(voice["text"])))
            continue

        flat = _clean(payload)
        match = _TXT_LINE.match(flat)
        if match and len(match["speaker"].split()) <= 4:
            turns.append((match["speaker"].strip(), start, match["text"].strip()))
        else:
            unnamed += 1

    if unnamed:
        raise TranscriptError(
            f"{unnamed} fragmentos del .vtt no dicen quién habla. Activá la "
            "identificación de hablantes al exportar: el estudio necesita "
            "turnos con hablante identificado."
        )
    return turns


# ------------------------------------------------------------------- común
def _merge(raw: list[tuple[str, str, str]]) -> list[ParsedTurn]:
    merged: list[list[str]] = []
    for speaker, start, text in raw:
        if not text:
            continue
        if merged and merged[-1][0] == speaker:
            merged[-1][2] += " " + text
        else:
            merged.append([speaker, start, text])
    return [
        ParsedTurn(turn_id=i, speaker=s, starts_at=t, text=x)
        for i, (s, t, x) in enumerate(merged, 1)
    ]


def _clean(text: str) -> str:
    return " ".join(html.unescape(_TAG.sub("", text)).split())


def _stamp(value: str | None) -> str:
    """Normaliza a ``mm:ss`` o ``h:mm:ss``. Sin marca de tiempo queda vacío:
    inventar una a partir del largo del texto sería fabricar el dato."""
    if not value:
        return ""
    parts = [int(float(p.replace(",", "."))) for p in value.split(":")]
    if len(parts) == 2:
        parts = [0, *parts]
    h, m, s = parts
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"
