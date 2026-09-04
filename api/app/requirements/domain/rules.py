"""Reglas de calidad basadas en texto.

Deterministas y sin modelo: se pueden recalcular sobre las doce revisiones
sin costo ni variabilidad. Cubren la mitad sintáctica y pragmática del marco
QUS; la mitad semántica requiere juicio humano y se muestrea aparte.
"""

from __future__ import annotations

import re

#: Umbral a partir del cual un requisito deja de ser estimable.
ATOMIC_LIMIT = 2

_CLAUSE_MARKERS = (
    r",\s*excepto\b",
    r",\s*en cuyo caso\b",
    r",\s*salvo\b",
    r"\sy debe\b",
    r",\s*distinguiendo\b",
)

_USER_STORY = re.compile(
    r"^como\s+.+?\s+quiero\s+.+?(,\s*para\s+.+)?\.?$",
    re.IGNORECASE | re.DOTALL,
)


def estimate_responsibilities(text: str) -> int:
    """Cuenta obligaciones distintas empaquetadas en un requisito.

    Heurística provisional: oraciones más los marcadores de subordinada que
    el español usa para colgar comportamiento extra sobre una historia ya
    existente. Alcanza para exponer la deriva de atomicidad que mide el
    estudio; el motor de reglas QUS completo la reemplaza.
    """
    sentences = len([part for part in re.split(r"(?<=\.)\s+", text.strip()) if part])
    extra = sum(len(re.findall(marker, text, re.IGNORECASE)) for marker in _CLAUSE_MARKERS)
    return sentences + extra


def is_well_formed(text: str) -> bool:
    """Verifica la plantilla ``Como <rol> quiero <acción> [para <beneficio>]``."""
    return bool(_USER_STORY.match(text.strip()))


def is_minimal(text: str) -> bool:
    """Una sola oración, sin notas ni cláusulas colgadas al final."""
    return estimate_responsibilities(text) == 1


def check(text: str) -> list[dict[str, str]]:
    """Señales de calidad para un requisito.

    Advertencias, nunca bloqueos: una regla que corrige sola mide la regla y
    no al revisor.
    """
    signals: list[dict[str, str]] = []

    responsibilities = estimate_responsibilities(text)
    if responsibilities > ATOMIC_LIMIT:
        signals.append(
            {
                "rule": "atomicity",
                "label": "Atomicidad",
                "detail": (
                    f"El requisito cubre {responsibilities} responsabilidades. "
                    "Puede convenir dividirlo."
                ),
            }
        )

    if not is_minimal(text) and responsibilities <= ATOMIC_LIMIT:
        signals.append(
            {
                "rule": "minimal",
                "label": "Minimalidad",
                "detail": "El texto excede una oración y acumula cláusulas condicionales.",
            }
        )

    if text.strip().lower().startswith("como ") and not is_well_formed(text):
        signals.append(
            {
                "rule": "well-formed",
                "label": "Formato",
                "detail": "No respeta la plantilla «Como <rol> quiero <acción> para <beneficio>».",
            }
        )

    return signals
