"""Reproducción de una generación ya registrada.

Sustituye al modelo releyendo la respuesta guardada en `llm_calls`. Es lo que
vuelve viable la fase de análisis: una cadena completa se re-ejecuta tantas
veces como haga falta, sin costo y con resultado idéntico.

Y es la única reproducibilidad disponible. Los modelos actuales no aceptan
`temperature` ni `top_p`, así que volver a pedirle al modelo no devuelve lo
mismo aunque el prompt sea idéntico.
"""

from __future__ import annotations

from ...requirements.domain.generation import (
    DraftBatch,
    GenerationRequest,
    GenerationResult,
)
from ..persistence.pool import cursor

STAGE = "propose"


class MissingRecording(Exception):
    """No hay llamada registrada para esa iteración."""


class ReplayProposalEngine:
    """Devuelve la generación registrada, sin llamar a la API."""

    def generate(self, request: GenerationRequest) -> GenerationResult:
        with cursor() as cur:
            cur.execute(
                """
                SELECT prompt, response, model_id, params,
                       input_tokens, output_tokens
                FROM llm_calls
                WHERE project_id = %s AND meeting_id = %s AND stage = %s
                ORDER BY id DESC
                LIMIT 1
                """,
                (request.project_id, request.meeting_id, STAGE),
            )
            row = cur.fetchone()

        if row is None:
            raise MissingRecording(
                f"No hay una generación registrada para {request.meeting_id}. "
                "Corré primero la generación real."
            )

        batch = DraftBatch.model_validate_json(row["response"])

        return GenerationResult(
            proposals=list(batch.proposals),
            model_id=row["model_id"],
            params=dict(row["params"]),
            prompt=row["prompt"],
            response=row["response"],
            input_tokens=row["input_tokens"],
            output_tokens=row["output_tokens"],
        )
