"""Transcripción local: faster-whisper para el texto, pyannote para las voces.

Corre en la máquina del investigador y nada del audio sale de ahí. No es solo
una decisión de privacidad: un servicio de transcripción cambia de modelo sin
avisar, y el estudio compara la reunión 1 contra la 5. Con el modelo fijado
acá, la deriva que se mide es la de los requisitos y no la del transcriptor.

Los dos modelos se cargan y se sueltan de a uno: tenerlos residentes a la vez
no hace falta y en una máquina sin GPU la memoria se agradece.
"""

from __future__ import annotations

import os
from collections.abc import Callable

from ...requirements.domain.transcription import (
    Segment,
    SpeakerSpan,
    TranscriptionRequest,
    TranscriptionResult,
    assign_speakers,
    into_turns,
)

#: `large-v3` y no `medium`: la transcripción es la verdad de referencia
#: contra la que el revisor juzga cada propuesta. Un error del transcriptor se
#: vuelve indistinguible de un error del agente.
DEFAULT_MODEL = "large-v3"

#: Cuantización de 8 bits. Sin GPU es la diferencia entre horas y minutos, y
#: en voz hablada la pérdida de calidad es despreciable.
DEFAULT_COMPUTE_TYPE = "int8"

DIARIZATION_MODEL = "pyannote/speaker-diarization-3.1"


class MissingToken(Exception):
    """Falta el token de HuggingFace que habilita el modelo de diarización."""


def hf_token() -> str | None:
    return os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")


def _noop(_: str) -> None:
    return None


class LocalTranscriptionEngine:
    """Adaptador del puerto `TranscriptionEngine`."""

    def __init__(
        self,
        *,
        model: str = DEFAULT_MODEL,
        compute_type: str = DEFAULT_COMPUTE_TYPE,
        device: str = "cpu",
        beam_size: int = 5,
        threads: int = 0,
        diarize: bool = True,
        on_stage: Callable[[str], None] | None = None,
    ) -> None:
        self._model = model
        self._compute_type = compute_type
        self._device = device
        self._beam_size = beam_size
        self._threads = threads or (os.cpu_count() or 1)
        self._diarize = diarize
        self._report = on_stage or _noop

        if diarize and hf_token() is None:
            raise MissingToken(
                "La diarización necesita un token de HuggingFace.\n"
                f"  1. Aceptá la licencia de {DIARIZATION_MODEL} en huggingface.co\n"
                "  2. Generá un token de lectura\n"
                "  3. Exportá HF_TOKEN=hf_...\n"
                "  Alternativa: correr con --sin-diarizacion; los turnos quedan\n"
                "  sin atribuir y el revisor no va a poder ver quién pidió qué."
            )

    @property
    def params(self) -> dict[str, object]:
        """Con qué se transcribió. Va a la base junto con los turnos."""
        return {
            "asr": "faster-whisper",
            "model": self._model,
            "compute_type": self._compute_type,
            "device": self._device,
            "beam_size": self._beam_size,
            "temperature": 0.0,
            "vad_filter": True,
            "condition_on_previous_text": False,
            "diarization": DIARIZATION_MODEL if self._diarize else None,
        }

    def transcribe(self, request: TranscriptionRequest) -> TranscriptionResult:
        # Los imports son perezosos a propósito: el dominio y sus pruebas se
        # cargan sin torch instalado, y el proceso web nunca toca este módulo.
        from faster_whisper import WhisperModel

        self._report(f"Cargando {self._model} ({self._compute_type}, {self._threads} hilos)…")
        asr = WhisperModel(
            self._model,
            device=self._device,
            compute_type=self._compute_type,
            cpu_threads=self._threads,
        )

        self._report("Transcribiendo…")
        raw, info = asr.transcribe(
            request.audio_path,
            language=request.language,
            beam_size=self._beam_size,
            # Temperatura fija y sin escalones de reintento: el modelo por
            # defecto sube la temperatura cuando desconfía de su propia
            # salida, y eso vuelve irreproducible justo el tramo difícil.
            temperature=0.0,
            # Cortar el silencio acelera y, sobre todo, evita que el modelo
            # invente texto donde no hay habla.
            vad_filter=True,
            # Sin arrastrar el contexto anterior. Da algo menos de coherencia,
            # pero en grabaciones largas es lo que impide que el modelo entre
            # en un bucle y repita una frase durante minutos. Una alucinación
            # acá terminaría citada como evidencia de un requisito.
            condition_on_previous_text=False,
        )

        segments = [
            Segment(start=item.start, end=item.end, text=item.text) for item in raw
        ]
        language = info.language
        self._report(f"{len(segments)} tramos · idioma {language}")

        del asr

        if self._diarize:
            segments = assign_speakers(segments, self._voices(request.audio_path))

        return TranscriptionResult(
            turns=into_turns(segments),
            language=language,
            model_id=self._model,
            params=self.params,
        )

    def _voices(self, audio_path: str) -> list[SpeakerSpan]:
        """Quién habló y cuándo, sin saber qué se dijo."""
        import soundfile as sf
        import torch
        from pyannote.audio import Pipeline

        self._report("Separando voces…")
        pipeline = Pipeline.from_pretrained(DIARIZATION_MODEL, token=hf_token())
        if pipeline is None:
            raise MissingToken(
                f"HuggingFace no entregó {DIARIZATION_MODEL}. Suele ser que "
                "falte aceptar la licencia del modelo con la misma cuenta del "
                "token."
            )
        pipeline.to(torch.device(self._device))

        # El audio se carga en memoria y se le pasa ya decodificado. pyannote
        # decodifica con torchcodec, que se apoya en las bibliotecas de FFmpeg
        # del sistema y no soporta las versiones más nuevas; entregarle la
        # onda evita depender de qué FFmpeg tenga instalada la máquina.
        data, sample_rate = sf.read(audio_path, dtype="float32", always_2d=True)
        waveform = torch.from_numpy(data.T)

        annotation = pipeline({"waveform": waveform, "sample_rate": sample_rate})
        spans = [
            SpeakerSpan(start=turn.start, end=turn.end, speaker=str(speaker))
            for turn, _, speaker in annotation.itertracks(yield_label=True)
        ]
        voices = len({span.speaker for span in spans})
        self._report(f"{voices} voces distinguidas en {len(spans)} tramos")
        return spans
