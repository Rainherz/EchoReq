"""Conjuntos de datos exportables.

Cada entrada declara para qué sirve, qué columnas trae y de dónde salen. El
diccionario de datos que ve el usuario y el CSV que se descarga se derivan de
la misma definición, así que no pueden desincronizarse.

Reporte, no dominio: estas consultas leen tablas directamente en vez de pasar
por entidades. La salida está pensada para pandas, no para la aplicación.
"""

from __future__ import annotations

import csv
import io
from collections.abc import Callable
from dataclasses import dataclass, field

from ...requirements.domain import rules
from .pool import cursor


@dataclass(frozen=True, slots=True)
class Dataset:
    name: str
    title: str
    purpose: str
    #: Columna -> qué significa. Es el diccionario de datos del estudio.
    codebook: dict[str, str]
    sql: str
    #: Columnas calculadas en Python después de la consulta. Las reglas de
    #: calidad no son expresables en SQL, y duplicarlas ahí sería tener una
    #: segunda implementación que puede divergir de la que usa el análisis.
    derived: dict[str, Callable[[dict], object]] = field(default_factory=dict)


DATASETS: dict[str, Dataset] = {
    "decisions": Dataset(
        name="decisions",
        title="Decisiones de revisión",
        purpose=(
            "Origen de H2 y H3. Una fila por decisión, con el intervalo medido "
            "y la marca de si la propuesta era defectuosa a sabiendas."
        ),
        codebook={
            "decision_id": "Identificador de la decisión.",
            "iteration": "Número de reunión.",
            "proposal_id": "Propuesta decidida.",
            "participant_id": "Quién revisó.",
            "action": "accept, edit o reject.",
            "target_id": "Requisito afectado.",
            "operation": "create, modify, delete o conflict.",
            "known_defective": "El guion de inyección sabía que era incorrecta.",
            "signal_count": "Cuántas señales de regla mostraba la propuesta.",
            "presented_at": "Instante en que apareció en pantalla.",
            "decided_at": "Instante de la decisión.",
            "seconds": "Intervalo de revisión. La medición de registro.",
            "was_edited": "El revisor modificó el texto propuesto.",
            "corrected": "El revisor la marcó después como error de registro.",
            "intended_action": "Qué había querido hacer, si se corrigió.",
            "correction_reason": "Motivo declarado de la corrección.",
        },
        sql="""
            SELECT
                d.id                                AS decision_id,
                p.iteration,
                d.proposal_id,
                d.participant_id,
                d.action,
                p.target_id,
                p.operation,
                p.known_defective,
                jsonb_array_length(p.signals)       AS signal_count,
                d.presented_at,
                d.decided_at,
                EXTRACT(EPOCH FROM (d.decided_at - d.presented_at)) AS seconds,
                (d.edited_content IS NOT NULL)      AS was_edited,
                (c.id IS NOT NULL)                  AS corrected,
                c.intended_action,
                c.reason                            AS correction_reason
            FROM review_decisions d
            JOIN change_proposals p ON p.id = d.proposal_id
            LEFT JOIN decision_corrections c ON c.decision_id = d.id
            WHERE p.project_id = %(project_id)s
            ORDER BY p.iteration, d.id
        """,
    ),
    "revisions": Dataset(
        name="revisions",
        title="Log de revisiones",
        purpose=(
            "Historia completa del documento. Una fila por cambio, con el turno "
            "de conversación que lo originó."
        ),
        codebook={
            "requirement_id": "Requisito.",
            "revision": "Revisión del documento en que se anexó.",
            "meeting_id": "Reunión de origen.",
            "operation": "Operación aplicada.",
            "source_turn_ids": "Turnos citados, separados por punto y coma.",
            "responsibilities": "Obligaciones empaquetadas en el texto resultante.",
            "chars": "Longitud del requisito.",
            "content": "Texto del requisito en esa revisión.",
        },
        sql="""
            SELECT
                requirement_id,
                revision,
                meeting_id,
                operation,
                array_to_string(source_turn_ids, ';') AS source_turn_ids,
                length(content)                       AS chars,
                content
            FROM requirement_revisions
            WHERE project_id = %(project_id)s
            ORDER BY revision, requirement_id
        """,
        derived={
            "responsibilities": lambda row: rules.estimate_responsibilities(
                row["content"]
            )
        },
    ),
    "proposals": Dataset(
        name="proposals",
        title="Propuestas generadas",
        purpose=(
            "Todo lo que el agente propuso, se haya aceptado o no. El denominador "
            "de las tasas de aceptación."
        ),
        codebook={
            "proposal_id": "Identificador.",
            "iteration": "Número de reunión.",
            "operation": "create, modify, delete o conflict.",
            "target_id": "Requisito afectado.",
            "source_turn_ids": "Turnos citados, separados por punto y coma.",
            "known_defective": "Marcada como incorrecta por el guion de inyección.",
            "signal_count": "Señales de regla que mostraba.",
            "theme": "Agrupamiento temático, solo en modo descubrimiento.",
            "rationale": "Justificación declarada por el agente.",
        },
        sql="""
            SELECT
                id AS proposal_id,
                iteration,
                operation,
                target_id,
                array_to_string(source_turn_ids, ';') AS source_turn_ids,
                known_defective,
                jsonb_array_length(signals) AS signal_count,
                theme,
                rationale
            FROM change_proposals
            WHERE project_id = %(project_id)s
            ORDER BY iteration, id
        """,
    ),
    "turns": Dataset(
        name="turns",
        title="Transcripción por turnos",
        purpose=(
            "Unidad de cita del sistema. Permite verificar a mano cualquier "
            "enlace requisito ↔ conversación."
        ),
        codebook={
            "meeting_id": "Reunión.",
            "iteration": "Número de reunión.",
            "turn_id": "Identificador estable del turno.",
            "speaker": "Hablante según la diarización.",
            "starts_at": "Momento dentro de la grabación.",
            "text": "Lo dicho.",
        },
        sql="""
            SELECT t.meeting_id, m.iteration, t.turn_id, t.speaker, t.starts_at, t.text
            FROM turns t
            JOIN meetings m ON m.id = t.meeting_id
            WHERE m.project_id = %(project_id)s
            ORDER BY m.iteration, t.turn_id
        """,
    ),
    "llm_calls": Dataset(
        name="llm_calls",
        title="Llamadas al modelo",
        purpose=(
            "Auditoría y reproducción. Permite re-ejecutar una cadena completa "
            "sin costo y con resultado idéntico."
        ),
        codebook={
            "call_id": "Identificador.",
            "iteration": "Número de reunión.",
            "stage": "Etapa del pipeline que la originó.",
            "model_id": "Identificador exacto del modelo.",
            "input_tokens": "Tokens de entrada.",
            "output_tokens": "Tokens de salida.",
            "created_at": "Momento de la llamada.",
        },
        sql="""
            SELECT id AS call_id, iteration, stage, model_id,
                   input_tokens, output_tokens, created_at
            FROM llm_calls
            WHERE project_id = %(project_id)s
            ORDER BY iteration, id
        """,
    ),
}


def row_count(dataset: Dataset, project_id: str) -> int:
    with cursor() as cur:
        cur.execute(
            f"SELECT count(*) AS n FROM ({dataset.sql}) AS q",  # noqa: S608
            {"project_id": project_id},
        )
        return cur.fetchone()["n"]


def to_csv(dataset: Dataset, project_id: str) -> str:
    """Serializa el conjunto como CSV con encabezado."""
    with cursor() as cur:
        cur.execute(dataset.sql, {"project_id": project_id})
        rows = cur.fetchall()

    columns = list(dataset.codebook.keys())

    missing = [
        column
        for column in columns
        if rows and column not in rows[0] and column not in dataset.derived
    ]
    if missing:
        raise KeyError(
            f"El conjunto {dataset.name} declara columnas que no produce: "
            f"{', '.join(missing)}."
        )

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        enriched = dict(row)
        for column, compute in dataset.derived.items():
            enriched[column] = compute(row)
        writer.writerow({column: enriched.get(column) for column in columns})
    return buffer.getvalue()
