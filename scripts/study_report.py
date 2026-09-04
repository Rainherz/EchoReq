#!/usr/bin/env python3
"""Resumen de los datos del estudio para el smoke test.

Vive en su propio archivo en vez de embebido en el shell: mezclar comillas de
bash con f-strings de Python fue fuente de tres bugs seguidos en este script.

Sale con 1 si falta algo, para que el smoke test lo marque como falla.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

API = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8010/api"
PROJECT = sys.argv[2] if len(sys.argv) > 2 else "clinica-norte"
PARTICIPANT = sys.argv[3] if len(sys.argv) > 3 else "p-analista-01"


def get(path: str):
    try:
        with urllib.request.urlopen(f"{API}{path}", timeout=5) as response:
            return json.load(response)
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
        print(f"  no se pudo consultar {path}: {exc}")
        return None


def main() -> int:
    problems = 0

    drift = get(f"/projects/{PROJECT}/drift")
    if not drift:
        print("  sin revisiones cargadas — probá: make seed")
        problems += 1
    else:
        for row in drift:
            print(
                f"  rev {row['revision']}: {row['requirements']} requisitos"
                f" · media {row['meanResponsibilities']}"
                f" · máx {row['maxResponsibilities']}"
            )

    queue = get(f"/projects/{PROJECT}/iterations/3/queue?participant={PARTICIPANT}")
    if queue is None:
        problems += 1
    else:
        print(f"  cola de la iteración 3: {len(queue)} propuestas pendientes")

    metrics = get(f"/projects/{PROJECT}/metrics")
    if metrics is None:
        problems += 1
    elif not metrics:
        print("  todavía no hay decisiones registradas")
    else:
        for row in metrics:
            print(
                f"  iteración {row['iteration']}: {row['decisions']} decisiones"
                f" · mediana {row['medianSeconds']} s"
                f" · defectuosas aceptadas {row['defectiveAccepted']}/{row['defectiveTotal']}"
            )

    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
