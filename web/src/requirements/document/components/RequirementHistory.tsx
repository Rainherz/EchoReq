import type { RequirementRevision } from "../../domain/document";
import { estimateResponsibilities } from "../../domain/document";
import { ATOMIC_LIMIT } from "./ClauseMeter";

const OPERATION_LABEL: Record<RequirementRevision["operation"], string> = {
  create: "Alta",
  modify: "Modificación",
  delete: "Baja",
  conflict: "Conflicto",
};

export interface RejectedNote {
  revision: number;
  note: string;
}

interface RequirementHistoryProps {
  requirementId: string;
  history: RequirementRevision[];
  rejected: RejectedNote[];
  meetingLabel: (meetingId: string) => string;
}

/**
 * The requirement ↔ conversation link, iteration by iteration.
 *
 * Every entry points at concrete turns of a concrete meeting, so the trace is
 * verifiable rather than declared. Rejected proposals appear here too: a rule
 * that was raised and discarded leaves no text in the specification, and that
 * absence is exactly what the study needs to be able to see.
 */
export function RequirementHistory({
  requirementId,
  history,
  rejected,
  meetingLabel,
}: RequirementHistoryProps) {
  return (
    <div className="card">
      <div className="card__head">
        {requirementId} · historia completa
        <span className="card__count">
          {history.length} entrada{history.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="timeline">
        {history.map((row) => {
          const clauses = estimateResponsibilities(row.content);
          return (
            <div key={`${row.requirementId}-${row.revision}`} className="timeline__item">
              <div className="timeline__meta">
                <span>revisión {row.revision}</span>
                <span>{meetingLabel(row.meetingId)}</span>
                <span>turnos {row.sourceTurnIds.join(", ")}</span>
                <span className={clauses > ATOMIC_LIMIT ? "tag tag--warn" : "tag"}>
                  {OPERATION_LABEL[row.operation]}
                </span>
              </div>
              {row.summary}
              <div className="timeline__content">{row.content}</div>
            </div>
          );
        })}

        {rejected.map((entry) => (
          <div
            key={`rejected-${entry.revision}`}
            className="timeline__item timeline__item--rejected"
          >
            <div className="timeline__meta">
              <span>revisión {entry.revision}</span>
              <span className="tag tag--stop">Rechazada</span>
            </div>
            {entry.note}
          </div>
        ))}
      </div>
    </div>
  );
}
