"""Almacenamiento de la transcripción importada.

Igual que el audio: el archivo va al disco tal cual llegó y la base guarda
dónde está y su hash. Con eso cualquiera puede volver a parsearlo y
comprobar que los turnos de la base salen exactamente de ese archivo.
"""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from pathlib import Path

from .audio import _safe_name


def storage_root() -> Path:
    return Path(
        os.environ.get("ECHOREQ_TRANSCRIPT_DIR", "storage/transcripts")
    ).resolve()


@dataclass(frozen=True, slots=True)
class StoredTranscript:
    filename: str
    path: str
    sha256: str


def store(meeting_id: str, filename: str, raw: bytes) -> StoredTranscript:
    """Guarda los bytes recibidos y devuelve sus datos de verificación.

    El tope y el formato ya los controló el parser: a esta altura el archivo
    se pudo convertir en turnos, y lo que se guarda es exactamente eso.
    """
    root = storage_root()
    root.mkdir(parents=True, exist_ok=True)
    target = root / _safe_name(meeting_id, filename)

    # Temporal y renombre, como el audio: un fallo a mitad de escritura no
    # deja un archivo truncado ocupando el lugar del bueno.
    staging = target.with_suffix(target.suffix + ".part")
    try:
        staging.write_bytes(raw)
        staging.replace(target)
    except Exception:
        staging.unlink(missing_ok=True)
        raise

    return StoredTranscript(
        filename=filename,
        path=str(target),
        sha256=hashlib.sha256(raw).hexdigest(),
    )
