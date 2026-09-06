"""Conexión a PostgreSQL."""

from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

DEFAULT_DSN = "postgresql://echoreq:echoreq@localhost:5433/echoreq"


def dsn() -> str:
    return os.environ.get("ECHOREQ_DSN", DEFAULT_DSN)


_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            dsn(),
            min_size=1,
            max_size=8,
            open=True,
            # Se comprueba la conexión antes de entregarla. Sin esto el pool
            # reparte conexiones muertas después de que la base se reinicie, y
            # la que paga es la transcripción: hace una hora de trabajo en
            # memoria y recién al final escribe. Reventar ahí cuesta la hora
            # entera, y el registro del error también falla.
            check=ConnectionPool.check_connection,
        )
    return _pool


@contextmanager
def cursor() -> Iterator:
    with get_pool().connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        yield cur


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None
