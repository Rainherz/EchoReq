"""El fixture tiene que cargar sobre el esquema completo.

La migración 009 exige `defect_kind` en toda propuesta `known_defective`. El
seed marcaba p-02 y d-202 como defectuosas sin declarar el tipo, y `make
reset` reventaba contra `change_proposals_defect_declared`.
"""

from __future__ import annotations

import seed
from app.adapters.persistence.pool import cursor


def test_fixture_loads_on_the_full_schema(scratch_db) -> None:
    seed.seed()

    with cursor() as cur:
        cur.execute(
            "SELECT id, defect_kind FROM change_proposals "
            "WHERE project_id = %s AND known_defective",
            (seed.PROJECT,),
        )
        rows = cur.fetchall()

    assert rows
    assert all(row["defect_kind"] for row in rows)


def test_demo_series_loads_on_the_full_schema(scratch_db) -> None:
    seed.seed()
    seed.seed_demo_decisions()

    with cursor() as cur:
        cur.execute(
            "SELECT defect_kind FROM change_proposals WHERE id = 'd-202'"
        )
        row = cur.fetchone()

    assert row["defect_kind"]
