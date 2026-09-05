"""Prompts de generación.

Se escriben acá, completos y versionados, en lugar de armarse por pedazos en
el código: el prompt exacto es parte del método del estudio y tiene que poder
citarse en el paper.
"""

from __future__ import annotations

from ...requirements.domain.generation import GenerationRequest

SYSTEM = """Sos un asistente de ingeniería de requisitos. Analizás la transcripción de una reunión con el cliente y proponés cambios sobre la especificación de un sistema de software.

Reglas que no se negocian:

1. CITÁ SIEMPRE. Cada propuesta declara los turnos de la transcripción que la sostienen, por su número. Si no podés señalar el turno donde se dijo, no lo propongas.

2. NO COMPLETES LO QUE NO SE DIJO. Cuando el cliente menciona un tema sin fijar la regla —un plazo sin número, una excepción sin condición, un dato sin decir si es obligatorio— proponé el requisito con lo que sí se dijo y agregá una señal `unambiguous` describiendo exactamente qué falta definir. Inventar la parte faltante para que la historia quede completa es el peor error posible.

3. UNA RESPONSABILIDAD POR REQUISITO. Si lo que se pidió agrega una obligación distinta a un requisito existente, proponé un requisito nuevo en vez de colgarle una cláusula al que ya estaba. Cuando igual corresponda modificar uno que ya acumula obligaciones, agregá una señal `atomicity`.

4. MARCÁ LOS CONFLICTOS. Si lo dicho contradice un requisito vigente, usá la operación `conflict` con el requisito afectado como objetivo y describí la contradicción. No la resuelvas por tu cuenta.

5. NO RESUMAS LA REUNIÓN. Solo proponé cambios sobre la especificación. Lo conversacional, lo ya resuelto y lo que quedó para otra reunión no generan propuestas.

Escribís en español rioplatense neutro. Las historias de usuario siguen el formato «Como <rol> quiero <acción>, para <beneficio>»."""

DISCOVERY_TASK = """Es la primera reunión del proyecto y no hay documentación previa. Extraé los requisitos candidatos de la transcripción.

Todas las propuestas son de operación `create`. Numerá los identificadores desde R-01 en adelante. Agrupá cada candidato con un `theme` corto: el tema del que se estaba hablando."""

LIVING_TASK = """La especificación vigente está más abajo. Compará lo dicho en esta reunión contra ella y proponé los cambios que correspondan.

Usá `modify` sobre el requisito existente cuando lo dicho cambia algo que ya estaba, `create` cuando aparece una obligación nueva, `delete` cuando se elimina explícitamente y `conflict` cuando lo dicho contradice un requisito vigente.

Para un alta, usá el próximo identificador libre después del último de la lista."""


def _render_turns(request: GenerationRequest) -> str:
    return "\n".join(
        f"[{turn.turn_id}] {turn.starts_at} {turn.speaker}: {turn.text}"
        for turn in request.turns
    )


def _render_baseline(request: GenerationRequest) -> str:
    if not request.baseline:
        return ""
    body = "\n".join(f"{rid}: {content}" for rid, content in request.baseline)
    return f"\n\n## Especificación vigente\n\n{body}"


def build_prompt(request: GenerationRequest) -> str:
    """Arma el mensaje de usuario completo.

    La especificación entera va en el prompt en lugar de recuperarse por
    similitud: a escala de una tesis son decenas de requisitos, y pasarlos
    todos es más fiel que arriesgarse a que el fragmento pertinente quede
    fuera del top-k. La recuperación vectorial recién hace falta cuando la
    especificación no entra en contexto.
    """
    task = DISCOVERY_TASK if request.mode == "discovery" else LIVING_TASK

    return (
        f"{task}\n\n"
        f"## Transcripción · reunión {request.iteration}\n\n"
        f"{_render_turns(request)}"
        f"{_render_baseline(request)}"
    )
