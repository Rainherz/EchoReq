"""Almacenamiento del audio de las reuniones.

El archivo va al disco y la base guarda dónde está y su hash. El hash no es
adorno: permite comprobar que el audio del que salió una transcripción es el
mismo que se grabó, sin confiar en el nombre del archivo.
"""

from __future__ import annotations

import hashlib
import os
import re
from dataclasses import dataclass
from pathlib import Path

#: Formatos que la transcripción sabe leer.
ALLOWED_SUFFIXES = frozenset({".mp3", ".m4a", ".wav", ".ogg", ".flac", ".webm"})

#: Tope por archivo. Una reunión de una hora en m4a ronda los 60 MB.
MAX_BYTES = 500 * 1024 * 1024

#: Se lee de a pedazos para no cargar el archivo entero en memoria.
CHUNK = 1024 * 1024


def storage_root() -> Path:
    return Path(os.environ.get("ECHOREQ_AUDIO_DIR", "storage/audio")).resolve()


class RejectedAudio(Exception):
    """El archivo no se puede aceptar."""


@dataclass(frozen=True, slots=True)
class StoredAudio:
    filename: str
    path: str
    size_bytes: int
    sha256: str


def _safe_name(meeting_id: str, original: str) -> str:
    """Nombre de archivo derivado del identificador de la reunión.

    El nombre que sube el usuario no se usa como ruta: solo se conserva su
    extensión. Así un nombre con `../` o con caracteres raros no puede
    decidir dónde se escribe.
    """
    suffix = Path(original).suffix.lower()
    safe_id = re.sub(r"[^A-Za-z0-9_-]", "_", meeting_id)
    return f"{safe_id}{suffix}"


def store(meeting_id: str, filename: str, stream) -> StoredAudio:
    """Guarda el audio y devuelve sus datos de verificación.

    Falla si la extensión no es de audio o si el archivo excede el tope. El
    tamaño se controla mientras se escribe, no con el encabezado
    Content-Length, que el cliente puede mentir.
    """
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise RejectedAudio(
            f"«{suffix or 'sin extensión'}» no es un formato de audio admitido. "
            f"Se aceptan: {', '.join(sorted(ALLOWED_SUFFIXES))}."
        )

    root = storage_root()
    root.mkdir(parents=True, exist_ok=True)
    target = root / _safe_name(meeting_id, filename)

    digest = hashlib.sha256()
    written = 0

    # Se escribe a un temporal y se renombra al final: un fallo a mitad de
    # subida no deja un archivo truncado ocupando el lugar del bueno.
    staging = target.with_suffix(target.suffix + ".part")
    try:
        with staging.open("wb") as out:
            while chunk := stream.read(CHUNK):
                written += len(chunk)
                if written > MAX_BYTES:
                    raise RejectedAudio(
                        f"El archivo supera el tope de {MAX_BYTES // (1024 * 1024)} MB."
                    )
                digest.update(chunk)
                out.write(chunk)

        if written == 0:
            raise RejectedAudio("El archivo está vacío.")

        staging.replace(target)
    except Exception:
        staging.unlink(missing_ok=True)
        raise

    return StoredAudio(
        filename=filename,
        path=str(target),
        size_bytes=written,
        sha256=digest.hexdigest(),
    )
