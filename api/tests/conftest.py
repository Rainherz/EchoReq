"""Base descartable para las pruebas que necesitan PostgreSQL de verdad.

Se crea con las migraciones y se borra al terminar: varias tablas son de solo
anexado y no admiten borrado, así que sembrar filas de prueba en la base de
desarrollo las dejaría ahí para siempre.
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path

import psycopg
import pytest
from psycopg import sql

from app.adapters.persistence import pool

MIGRATIONS = Path(__file__).parent.parent / "migrations"


@pytest.fixture(scope="module")
def scratch_db():
    admin_dsn = pool.dsn()
    name = f"echoreq_test_{uuid.uuid4().hex[:8]}"
    with psycopg.connect(admin_dsn, autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
    base, _, _ = admin_dsn.rpartition("/")
    scratch = f"{base}/{name}"
    with psycopg.connect(scratch, autocommit=True) as conn:
        for migration in sorted(MIGRATIONS.glob("*.sql")):
            conn.execute(migration.read_text())

    previous = os.environ.get("ECHOREQ_DSN")
    pool.close_pool()
    os.environ["ECHOREQ_DSN"] = scratch
    yield scratch
    pool.close_pool()
    if previous is None:
        os.environ.pop("ECHOREQ_DSN")
    else:
        os.environ["ECHOREQ_DSN"] = previous
    with psycopg.connect(admin_dsn, autocommit=True) as admin:
        admin.execute(
            sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name))
        )
