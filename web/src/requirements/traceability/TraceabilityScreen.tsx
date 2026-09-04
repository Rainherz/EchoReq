import { useMemo } from "react";
import { documentAt } from "../domain/document";
import type { RequirementRevision } from "../domain/document";
import { ATOMIC_LIMIT } from "../document/components/ClauseMeter";
import "./traceability.css";

const MARK: Record<RequirementRevision["operation"], { cls: string; text: string }> = {
  create: { cls: "mark mark--create", text: "A" },
  modify: { cls: "mark mark--modify", text: "M" },
  delete: { cls: "mark mark--modify", text: "B" },
  conflict: { cls: "mark mark--conflict", text: "C" },
};

interface TraceabilityScreenProps {
  log: RequirementRevision[];
  currentRevision: number;
  meetings: Record<number, { id: string; label: string; date: string }>;
  rejected: Array<{ revision: number; targetId: string; note: string }>;
}

/**
 * Requirement × iteration matrix.
 *
 * The document screen answers "what does this requirement say now"; this one
 * answers "which requirements does each meeting keep reopening". A row marked
 * in every column is the shape drift takes.
 */
export function TraceabilityScreen({
  log,
  currentRevision,
  meetings,
  rejected,
}: TraceabilityScreenProps) {
  const revisions = Array.from({ length: currentRevision }, (_, i) => i + 1);

  const requirementIds = useMemo(
    () => [...new Set(log.map((row) => row.requirementId))].sort(),
    [log],
  );

  /** Clause count of each requirement at each revision, for the trend column. */
  const clausesByRevision = useMemo(() => {
    const snapshots = revisions.map((revision) => documentAt(log, revision));
    return new Map(
      requirementIds.map((id) => [
        id,
        snapshots.map(
          (snapshot) =>
            snapshot.find((entry) => entry.requirementId === id)?.responsibilities ??
            null,
        ),
      ]),
    );
  }, [log, requirementIds, revisions]);

  /**
   * Marks for one cell.
   *
   * A requirement can be both amended and the target of a rejected proposal in
   * the same iteration, so this returns every mark rather than the first: the
   * rejection is precisely what must not be hidden behind an accepted change.
   */
  const cellFor = (requirementId: string, revision: number) => {
    const marks = log
      .filter(
        (entry) =>
          entry.requirementId === requirementId && entry.revision === revision,
      )
      .map((entry) => MARK[entry.operation]);

    const rejectedHere = rejected.filter(
      (entry) => entry.targetId === requirementId && entry.revision === revision,
    );
    for (const _ of rejectedHere) {
      marks.push({ cls: "mark mark--rejected", text: "R" });
    }

    return marks;
  };

  return (
    <div className="trace">
      <div className="screen__head">
        <span className="screen__title">Matriz de trazabilidad</span>
        <span className="screen__meta">
          {requirementIds.length} requisitos × {currentRevision} iteraciones
        </span>
      </div>

      <div className="card">
        <div className="card__head">
          Requisitos tocados por iteración
          <span className="card__count">A alta · M modificación · R rechazada</span>
        </div>

        <div className="trace__scroll">
          <table className="matrix">
            <thead>
              <tr>
                <th>Requisito</th>
                {revisions.map((revision) => (
                  <th key={revision}>
                    r{revision}
                    <small>{meetings[revision]?.date ?? ""}</small>
                  </th>
                ))}
                <th>Responsabilidades</th>
              </tr>
            </thead>
            <tbody>
              {requirementIds.map((id) => {
                const trend = clausesByRevision.get(id) ?? [];
                const last = trend.at(-1);
                return (
                  <tr key={id}>
                    <td className="matrix__id">{id}</td>
                    {revisions.map((revision) => {
                      const marks = cellFor(id, revision);
                      return (
                        <td key={revision}>
                          {marks.length > 0 ? (
                            <span className="matrix__marks">
                              {marks.map((mark, i) => (
                                <span key={i} className={mark.cls}>
                                  {mark.text}
                                </span>
                              ))}
                            </span>
                          ) : (
                            <span className="mark mark--none">·</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="matrix__trend">
                      {trend
                        .map((value) => (value === null ? "·" : String(value)))
                        .join(" → ")}
                      {last !== null && last !== undefined && last > ATOMIC_LIMIT && (
                        <b> ⚠</b>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="legend">
          <span>
            <i className="mark mark--create">A</i> alta
          </span>
          <span>
            <i className="mark mark--modify">M</i> modificación
          </span>
          <span>
            <i className="mark mark--rejected">R</i> propuesta rechazada
          </span>
          <span>
            <i className="mark mark--none">·</i> sin tocar
          </span>
        </div>
      </div>

      {rejected.length > 0 && (
        <div className="trace__note">
          <strong>Lo que no quedó escrito.</strong>{" "}
          {rejected.map((entry) => entry.note).join(" ")} Una propuesta rechazada no
          deja texto en la especificación, pero sí queda registrada acá: la ausencia
          es un dato del estudio, no un hueco.
        </div>
      )}
    </div>
  );
}
