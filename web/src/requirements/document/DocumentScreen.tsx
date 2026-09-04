import { useMemo, useState } from "react";
import { documentAt, historyOf } from "../domain/document";
import type { RequirementRevision } from "../domain/document";
import { RequirementTable } from "./components/RequirementTable";
import { RequirementHistory } from "./components/RequirementHistory";
import type { RejectedNote } from "./components/RequirementHistory";
import { ATOMIC_LIMIT } from "./components/ClauseMeter";
import "./document.css";

interface DocumentScreenProps {
  log: RequirementRevision[];
  currentRevision: number;
  meetings: Record<number, { id: string; label: string; date: string }>;
  rejected: Array<{ revision: number; targetId: string; note: string }>;
}

/**
 * The specification as frozen at a chosen revision.
 *
 * The revision selector is not a convenience: stepping back through the
 * revisions is how accumulated drift becomes observable without leaving the
 * screen.
 */
export function DocumentScreen({
  log,
  currentRevision,
  meetings,
  rejected,
}: DocumentScreenProps) {
  const [revision, setRevision] = useState(currentRevision);
  const [query, setQuery] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const entries = useMemo(() => documentAt(log, revision), [log, revision]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (onlyFlagged && entry.responsibilities <= ATOMIC_LIMIT) return false;
      if (!needle) return true;
      return (
        entry.requirementId.toLowerCase().includes(needle) ||
        entry.content.toLowerCase().includes(needle)
      );
    });
  }, [entries, query, onlyFlagged]);

  const flaggedCount = entries.filter(
    (entry) => entry.responsibilities > ATOMIC_LIMIT,
  ).length;

  const meetingLabel = (meetingId: string) =>
    Object.values(meetings).find((meeting) => meeting.id === meetingId)?.label ??
    meetingId;

  const selectedHistory = selectedId
    ? historyOf(log, selectedId).filter((row) => row.revision <= revision)
    : [];

  const selectedRejected: RejectedNote[] = selectedId
    ? rejected
        .filter((row) => row.targetId === selectedId && row.revision <= revision)
        .map(({ revision: r, note }) => ({ revision: r, note }))
    : [];

  const revisions = Array.from({ length: currentRevision }, (_, i) => i + 1);

  return (
    <div className="document">
      <div className="screen__head">
        <span className="screen__title">Especificación</span>
        <span className="screen__meta">
          {entries.length} requisitos · {flaggedCount} con alerta
        </span>
        <span className="screen__ops">
          {revisions.map((value) => (
            <button
              key={value}
              type="button"
              className="btn btn--chip"
              aria-pressed={value === revision}
              onClick={() => setRevision(value)}
            >
              revisión {value}
            </button>
          ))}
        </span>
      </div>

      <div className="card">
        <div className="card__head">
          Documento vigente
          <span className="card__count">
            {revision === currentRevision
              ? "última revisión"
              : `viendo revisión ${revision} de ${currentRevision}`}
          </span>
        </div>

        <div className="screen__head">
          <input
            className="field document__search"
            type="search"
            placeholder="Buscar requisito"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span className="screen__ops">
            <button
              type="button"
              className="btn btn--chip"
              aria-pressed={!onlyFlagged}
              onClick={() => setOnlyFlagged(false)}
            >
              todos
            </button>
            <button
              type="button"
              className="btn btn--chip"
              aria-pressed={onlyFlagged}
              onClick={() => setOnlyFlagged(true)}
            >
              con alertas
            </button>
          </span>
        </div>

        <RequirementTable
          entries={visible}
          selectedId={selectedId}
          onSelect={(id) => setSelectedId((current) => (current === id ? null : id))}
        />
      </div>

      {selectedId && selectedHistory.length > 0 && (
        <RequirementHistory
          requirementId={selectedId}
          history={selectedHistory}
          rejected={selectedRejected}
          meetingLabel={meetingLabel}
        />
      )}
    </div>
  );
}
