"""Adaptador de generación sobre la API de Claude."""

from __future__ import annotations

import os

import anthropic

from ...requirements.domain.generation import (
    DraftBatch,
    GenerationRequest,
    GenerationResult,
)
from . import prompts

#: Identificador exacto del modelo. Queda fijo y se registra con cada llamada:
#: un cambio de versión a mitad del estudio partiría la serie en dos.
MODEL_ID = "claude-opus-5"

#: Efecto sobre la profundidad de razonamiento y el gasto. `high` es el
#: equilibrio razonable para extracción estructurada.
EFFORT = "high"

MAX_TOKENS = 16000


class ClaudeProposalEngine:
    """Genera propuestas con el modelo real.

    Nota sobre reproducibilidad: los modelos actuales no aceptan `temperature`
    ni `top_p`, así que dos corridas del mismo prompt pueden diferir. La única
    vía de reproducción exacta es releer lo registrado en `llm_calls`, que es
    para lo que existe `ReplayProposalEngine`.
    """

    def __init__(self, client: anthropic.Anthropic | None = None) -> None:
        self._client = client or anthropic.Anthropic()

    def generate(self, request: GenerationRequest) -> GenerationResult:
        prompt = prompts.build_prompt(request)

        response = self._client.messages.parse(
            model=MODEL_ID,
            max_tokens=MAX_TOKENS,
            system=prompts.SYSTEM,
            thinking={"type": "adaptive"},
            output_config={"effort": EFFORT},
            messages=[{"role": "user", "content": prompt}],
            output_format=DraftBatch,
        )

        if response.stop_reason == "refusal":
            raise RuntimeError(
                "El modelo declinó la solicitud. Revisá el contenido de la "
                f"transcripción de {request.meeting_id}."
            )

        batch = response.parsed_output
        raw = next(
            (block.text for block in response.content if block.type == "text"), ""
        )

        return GenerationResult(
            proposals=list(batch.proposals) if batch else [],
            model_id=MODEL_ID,
            params={"effort": EFFORT, "max_tokens": MAX_TOKENS, "thinking": "adaptive"},
            prompt=prompt,
            response=raw,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
        )


def credentials_available() -> bool:
    """Indica si hay con qué autenticarse.

    Una clave sin definir no significa que no haya credenciales: el SDK
    también resuelve perfiles guardados en disco. Solo se afirma que no hay
    cuando no se encuentra ninguna de las dos vías.
    """
    if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        return True
    profile = os.path.expanduser("~/.config/anthropic")
    return os.path.isdir(profile)
