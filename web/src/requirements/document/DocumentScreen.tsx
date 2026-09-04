import { useCallback, useMemo, useState } from "react";
import {
  fetchDocument,
  fetchRejections,
  fetchRevisions,
} from "../../adapters/api/client";
import { useResource } from "../../adapters/api/useResource";
import { AsyncBoundary } from "../../shell/AsyncBoundary";
import { RequirementTable } from "./components/RequirementTable";
import { RequirementHistory } from "./components/RequirementHistory";
import { ATOMIC_LIMIT } from "./components/ClauseMeter";
import "./document.css";

interface DocumentScreenProps {
  projectId: string;
  currentRevision: number;
  meetingLabels: Record<string, string>;
}

/**
 * La especificación congelada en la revisión elegida.
 *
 * El selector de revisión no es una comodidad: retroceder por las revisiones
 * es cómo se observa la acumulación de cláusulas sin salir de la pantalla.
 * Cada salto pide el documento a la API, así que lo que se ve es exactamente
 * lo que calcularía el análisis.
 */
export function DocumentScreen({
  projectId,
  currentRevision,
  meetingLabels,
}: DocumentScreenProps) {
  const [revision, setRevision] = useState(currentRevision);
  const [query, setQuery] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const document = useResource(
    useCallback(() => fetchDocument(projectId, revision), [projectId, revision]),
    [projectId, revision],
  );
  const revisions = useResource(
    useCallback(() => fetchRevisions(projectId), [projectId]),
    [projectId],
  );
  const rejections = useResource(
    useCallback(() => fetchRejections(projectId), [projectId]),
    [projectId],
  );

  const entries = useMemo(() => document.data ?? [], [document.data]);

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

  const history = (revisions.data ?? []).filter(
    (row) => row.requirementId === selectedId && row.revision <= revision,
  );
  const rejectedHere = (rejections.data ?? []).filter(
    (row) => row.targetId === selectedId && row.iteration <= revision,
  );

  const revisionButtons = Array.from({ length: currentRevision }, (_, i) => i + 1);

  return (
    <div className="document">
      <div className="screen__head">
        <span className="screen__title">Especificación</span>
        <span className="screen__meta">
          {entries.length} requisitos · {flaggedCount} con alerta
        </span>
        <span className="screen__ops">
          {revisionButtons.map((value) => (
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

      <AsyncBoundary resource={document}>
        {() => (
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
              onSelect={(id) =>
                setSelectedId((current) => (current === id ? null : id))
              }
            />
          </div>
        )}
      </AsyncBoundary>

      {selectedId && history.length > 0 && (
        <RequirementHistory
          requirementId={selectedId}
          history={history}
          rejected={rejectedHere}
          meetingLabel={(meetingId) => meetingLabels[meetingId] ?? meetingId}
        />
      )}
    </div>
  );
}
