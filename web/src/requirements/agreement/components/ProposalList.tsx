import type { AgreementRow, Participant } from "../../../adapters/api/client";
import {
  disagreement as disagreementOf,
  groupByText,
  needsAttention,
} from "../lib/versions";

export type Filter = "todas" | "atencion" | "consolidadas";

interface ProposalListProps {
  rows: AgreementRow[];
  participants: Participant[];
  filter: Filter;
  onFilter: (filter: Filter) => void;
  selected: string | null;
  onSelect: (proposalId: string) => void;
  /** Id de la región de detalle, para que cada fila la referencie. */
  detailId: string;
}

/** Estado de la propuesta, en una palabra. Lo que la fila anuncia tiene que
    coincidir con lo que el detalle muestra al abrirla. */
function stateOf(row: AgreementRow): { label: string; tone: string } {
  if (row.outcome !== null) return { label: "consolidada", tone: "ok" };
  const mark = disagreementOf(row);
  if (mark !== null) return { label: mark, tone: "warn" };
  return { label: "consenso", tone: "quiet" };
}

/**
 * Cola de propuestas cruzadas.
 *
 * El filtro por defecto es «todas» y no «requieren atención» a propósito.
 * En un instrumento que mide concordancia el denominador pesa tanto como el
 * numerador: arrancar escondiendo las que coincidieron sesgaría lo primero
 * que ve quien analiza.
 */
export function ProposalList({
  rows,
  participants,
  filter,
  onFilter,
  selected,
  onSelect,
  detailId,
}: ProposalListProps) {
  const attention = rows.filter(needsAttention).length;
  const consolidated = rows.filter((row) => row.outcome !== null).length;

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "todas", label: "Todas", count: rows.length },
    { key: "atencion", label: "Requieren atención", count: attention },
    { key: "consolidadas", label: "Consolidadas", count: consolidated },
  ];

  const visible = rows.filter((row) =>
    filter === "atencion"
      ? needsAttention(row)
      : filter === "consolidadas"
        ? row.outcome !== null
        : true,
  );

  return (
    <div className="queue">
      <div className="queue__filters" role="group" aria-label="Filtrar la cola">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className="btn btn--chip"
            aria-pressed={filter === tab.key}
            onClick={() => onFilter(tab.key)}
          >
            {tab.label}
            <span className="chip__count">{tab.count}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="queue__empty">
          Ninguna propuesta entra en este filtro.
        </p>
      ) : (
        <ul className="queue__list">
          {visible.map((row) => {
            const state = stateOf(row);
            const versions = groupByText(participants, row.texts).length;
            const active = selected === row.proposalId;
            return (
              <li key={row.proposalId}>
                <button
                  type="button"
                  className={active ? "queue__row queue__row--on" : "queue__row"}
                  aria-current={active ? "true" : undefined}
                  aria-controls={detailId}
                  onClick={() => onSelect(row.proposalId)}
                >
                  <span className="queue__top">
                    <span className="queue__id">{row.targetId}</span>
                    <span className={`tag tag--${state.tone}`}>{state.label}</span>
                  </span>
                  <span className="queue__meta">
                    {row.reviewers} {row.reviewers === 1 ? "revisor" : "revisores"}
                    {" · "}
                    {versions} {versions === 1 ? "versión" : "versiones"}
                    {row.knownDefective && (
                      <>
                        {" · "}
                        <span className="queue__defect">{row.defectKind}</span>
                      </>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
