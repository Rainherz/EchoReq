"""Identificador legible derivado de un nombre."""

from __future__ import annotations

import re
import unicodedata

MAX_LENGTH = 60


def slugify(name: str) -> str:
    """Convierte un nombre en un identificador estable y legible.

    Se usa como identificador del proyecto y aparece en las URLs y en los
    nombres de los archivos exportados, así que se le sacan los acentos en
    lugar de codificarlos: `clinica-norte` se lee y se tipea; `cl%C3%ADnica`
    no.
    """
    normalized = unicodedata.normalize("NFKD", name)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_only).strip("-").lower()
    return slug[:MAX_LENGTH] or "proyecto"
