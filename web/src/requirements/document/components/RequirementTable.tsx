import type { DocumentEntry } from "../../domain/document";
import { ATOMIC_LIMIT, ClauseMeter } from "./ClauseMeter";

interface RequirementTableProps {
  entries: DocumentEntry[];
  selectedId: string | null;
  onSelect: (requirementId: string) => void;
}

export function RequirementTable({
  entries,
  selectedId,
  onSelect,
}: RequirementTableProps) {
  if (entries.length === 0) {
    return <p className="empty">Ningún requisito coincide con el filtro.</p>;
  }

  return (
    <table className="spec">
      <thead>
        <tr>
          <th colSpan={4}>Requisito · responsabilidades · origen</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.requirementId}>
            <td colSpan={4}>
              <button
                type="button"
                className="spec__row"
                aria-pressed={entry.requirementId === selectedId}
                onClick={() => onSelect(entry.requirementId)}
              >
                <span className="spec__id">{entry.requirementId}</span>
                <span className="spec__text">
                  {entry.content}
                  {entry.responsibilities > ATOMIC_LIMIT && (
                    <>
                      {" "}
                      <span className="tag tag--warn">
                        {entry.responsibilities} responsabilidades
                      </span>
                    </>
                  )}
                </span>
                <ClauseMeter count={entry.responsibilities} />
                <span className="spec__origin">
                  r{entry.bornInRevision} ·{" "}
                  {entry.changeCount === 0
                    ? "sin cambios"
                    : `${entry.changeCount} cambio${entry.changeCount === 1 ? "" : "s"}`}
                </span>
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
