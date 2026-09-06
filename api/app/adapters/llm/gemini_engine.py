"""Adaptador de generación sobre la API de Gemini.

Existe porque el estudio no cuenta con presupuesto para la API de Anthropic y
el nivel gratuito de Google AI Studio no pide tarjeta. Es una sustitución
declarada, no un detalle de implementación: con qué modelo se generaron las
propuestas es parte del método, y queda registrado en `llm_calls` con su
identificador real para que la tesis pueda decir de dónde salió cada dato.

La diferencia con el CLI de Antigravity —que también llega a Gemini— es la que
importa acá: esto es una llamada HTTP común. El prompt que corre es
exactamente el de `prompts.py`, sin system prompt ajeno delante, y el modelo
no tiene herramientas con las que actuar sobre la máquina.
"""

from __future__ import annotations

import os

from google import genai

from ...requirements.domain.generation import (
    DraftBatch,
    GenerationRequest,
    GenerationResult,
)
from . import prompts

#: Identificador exacto del modelo. Queda fijo y se registra con cada llamada:
#: un cambio de versión a mitad del estudio partiría la serie en dos.
MODEL_ID = "gemini-3.8-flash"


class GeminiProposalEngine:
    """Genera propuestas con el modelo de Google.

    Misma advertencia de reproducibilidad que el motor de Claude: sin control
    de muestreo, dos corridas del mismo prompt pueden diferir. La reproducción
    exacta sigue siendo releer lo registrado en `llm_calls`.
    """

    def __init__(self, client: genai.Client | None = None) -> None:
        self._client = client or genai.Client()

    def generate(self, request: GenerationRequest) -> GenerationResult:
        prompt = prompts.build_prompt(request)

        interaction = self._client.interactions.create(
            model=MODEL_ID,
            input=prompt,
            system_instruction=prompts.SYSTEM,
            # El esquema se deriva del mismo modelo Pydantic que valida la
            # respuesta. Si el contrato del dominio cambia, el pedido al
            # modelo cambia con él y no hay dos definiciones que sincronizar.
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": DraftBatch.model_json_schema(),
            },
        )

        if interaction.errors:
            raise RuntimeError(
                f"Gemini devolvió un error para {request.meeting_id}: "
                f"{interaction.errors}"
            )

        raw = interaction.output_text or ""
        if not raw.strip():
            raise RuntimeError(
                f"Gemini no devolvió contenido para {request.meeting_id} "
                f"(estado {interaction.status})."
            )

        batch = DraftBatch.model_validate_json(raw)
        usage = interaction.usage

        return GenerationResult(
            proposals=list(batch.proposals),
            model_id=MODEL_ID,
            params={"response_format": "json_schema", "schema": "DraftBatch"},
            prompt=prompt,
            response=raw,
            input_tokens=getattr(usage, "prompt_token_count", None),
            output_tokens=getattr(usage, "response_token_count", None),
        )


def credentials_available() -> bool:
    """Indica si hay clave de Google AI Studio en el entorno."""
    return bool(
        os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    )
