#!/usr/bin/env python
"""Monta las corridas del experimento en EchoReq, por la API.

    cd api && .venv/bin/python ../experimento/montar.py [--corridas 3] [--api http://localhost:8010/api]

Crea un proyecto por corrida y condición —exp-e-1, exp-ne-1, …— con una sola
reunión (descubrimiento), registra el consentimiento y sube la transcripción
de la condición. Una corrida por proyecto porque el modelo no es determinista:
cada generación es una réplica independiente sobre la misma entrada.

Usa la API y no la base directo: así el montaje pasa por el mismo camino que
la pantalla de Captura. Si un proyecto ya existe, lo deja como está.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
CONDICIONES = {
    "e": HERE / "entrevistas" / "E_estructurada.txt",
    "ne": HERE / "entrevistas" / "NE_no_estructurada.txt",
}
DOMINIO = (
    "Sistema de monitoreo docente para directores de instituciones educativas "
    "de la UGEL Lampa: registro de visitas con las rúbricas del Minedu, "
    "consolidados y reportes a la UGEL."
)
PARTICIPANTE = "p-analista-01"


def _body(raw: bytes):
    try:
        return json.loads(raw) if raw else None
    except ValueError:
        return raw.decode(errors="replace")[:300]


def call(api: str, method: str, path: str, body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        api + path, data=data, method=method,
        headers={"content-type": "application/json"} if data else {},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, _body(resp.read())
    except urllib.error.HTTPError as exc:
        return exc.code, _body(exc.read())
    except urllib.error.URLError as exc:
        sys.exit(f"No hay API en {api}: {exc.reason}. Levantala con: make api")


def upload(api: str, meeting_id: str, file: Path):
    boundary = uuid.uuid4().hex
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; "
        f"filename=\"{file.name}\"\r\nContent-Type: text/plain\r\n\r\n"
    ).encode() + file.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        f"{api}/meetings/{meeting_id}/transcript", data=body, method="POST",
        headers={"content-type": f"multipart/form-data; boundary={boundary}"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, _body(resp.read())
    except urllib.error.HTTPError as exc:
        return exc.code, _body(exc.read())


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--corridas", type=int, default=3)
    ap.add_argument("--api", default="http://localhost:8010/api")
    args = ap.parse_args()

    comandos = []
    for cond, transcript in CONDICIONES.items():
        for n in range(1, args.corridas + 1):
            name = f"Exp {cond.upper()} {n}"
            status, project = call(args.api, "POST", "/projects", {
                "name": name, "format": "user-story", "domain": DOMINIO,
            })
            if status == 409:
                print(f"{name}: ya existe, no se toca")
                continue
            if status != 201:
                print(f"{name}: no se pudo crear ({status}) {project}")
                return 1

            pid = project["id"]
            status, meeting = call(args.api, "POST", f"/projects/{pid}/meetings", {
                "label": f"Entrevista {'estructurada' if cond == 'e' else 'no estructurada'}",
                "held_at": "2026-11-09T15:00:00Z",
                "participant_id": PARTICIPANTE,
            })
            mid = meeting["id"]
            call(args.api, "POST", f"/meetings/{mid}/consent")
            status, imported = upload(args.api, mid, transcript)
            if status != 201:
                print(f"{name}: falló la transcripción ({status}) {imported}")
                return 1
            print(f"{pid:10} {mid:14} {imported['turnCount']} turnos  sha256 {imported['sha256'][:12]}…")
            comandos.append(f".venv/bin/python generate.py {mid} --project {pid}")

    if comandos:
        print("\nGenerá cada corrida (una llamada al modelo por línea):\n")
        print("\n".join(comandos))
    return 0


if __name__ == "__main__":
    sys.exit(main())
