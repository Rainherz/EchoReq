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
import re
import time

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

#: Cuántas veces se reintenta cuando el proveedor rechaza por límite o por
#: sobrecarga. El nivel gratuito limita por ventana, así que toparse es lo
#: normal y no un error del estudio; abandonar obligaría a rehacer la corrida
#: a mano cada vez.
MAX_RETRIES = 4

#: Espera de respaldo cuando la respuesta no dice cuánto esperar.
FALLBACK_WAIT = 45.0


class GeminiProposalEngine:
    """Genera propuestas con el modelo de Google.

    Misma advertencia de reproducibilidad que el motor de Claude: sin control
    de muestreo, dos corridas del mismo prompt pueden diferir. La reproducción
    exacta sigue siendo releer lo registrado en `llm_calls`.
    """

    def __init__(self, client: genai.Client | None = None, on_wait=None) -> None:
        self._client = client or genai.Client()
        self._report = on_wait or (lambda _: None)

    def _create(self, prompt: str):
        """Pide la generación, esperando si el proveedor lo pide.

        El nivel gratuito rechaza con 429 al pasarse de la ventana y con 500
        cuando está sobrecargado. Las dos son transitorias, y la respuesta
        suele decir cuántos segundos esperar: se respeta ese número en lugar
        de inventar uno.
        """
        ultimo: Exception | None = None
        for intento in range(MAX_RETRIES):
            try:
                return self._client.interactions.create(
                    model=MODEL_ID,
                    input=prompt,
                    system_instruction=prompts.SYSTEM,
                    # El esquema se deriva del mismo modelo Pydantic que
                    # valida la respuesta: si el contrato del dominio cambia,
                    # el pedido al modelo cambia con él.
                    response_format={
                        "type": "text",
                        "mime_type": "application/json",
                        "schema": DraftBatch.model_json_schema(),
                    },
                )
            except Exception as exc:  # noqa: BLE001 — se distingue por el texto
                mensaje = str(exc)
                transitorio = any(
                    marca in mensaje
                    for marca in ("429", "too_many_requests", "500", "high demand")
                )
                if not transitorio or intento == MAX_RETRIES - 1:
                    raise
                ultimo = exc
                espera = _retry_after(mensaje)
                self._report(
                    f"el proveedor pidió esperar {espera:.0f}s "
                    f"(intento {intento + 1} de {MAX_RETRIES})…"
                )
                time.sleep(espera)

        raise RuntimeError("No se pudo generar") from ultimo

    def generate(self, request: GenerationRequest) -> GenerationResult:
        prompt = prompts.build_prompt(request)
        interaction = self._create(prompt)

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

        # La API de Interactions devuelve su propio tipo `Usage`, distinto al
        # `UsageMetadata` de `generate_content`: los nombres son
        # `total_input_tokens` / `total_output_tokens`. Los de razonamiento
        # van aparte y no se suman a la salida, así que se registran como
        # parámetro: en este modelo pueden superar a la respuesta visible.
        params: dict[str, object] = {
            "response_format": "json_schema",
            "schema": "DraftBatch",
        }
        thoughts = getattr(usage, "total_thought_tokens", None)
        if thoughts is not None:
            params["thought_tokens"] = thoughts

        return GenerationResult(
            proposals=list(batch.proposals),
            model_id=MODEL_ID,
            params=params,
            prompt=prompt,
            response=raw,
            input_tokens=getattr(usage, "total_input_tokens", None),
            output_tokens=getattr(usage, "total_output_tokens", None),
        )


def _retry_after(mensaje: str) -> float:
    """Segundos que el proveedor pide esperar, si los dice."""
    encontrado = re.search(r"retry in ([\d.]+)s", mensaje)
    if encontrado:
        # Un poco más de lo pedido: volver justo en el límite vuelve a topar.
        return float(encontrado.group(1)) + 2.0
    return FALLBACK_WAIT


def credentials_available() -> bool:
    """Indica si hay clave de Google AI Studio en el entorno."""
    return bool(
        os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    )
