import { useCallback, useMemo } from "react";
import type { ProposalOperation } from "../domain/types";
import type { DocumentEntry, Rejection, RequirementRevision } from "../domain/document";
import {
  fetchDocumentSnapshots,
  fetchRejections,
  fetchRevisions,
} from "../../adapters/api/client";
import { useResource } from "../../adapters/api/useResource";
import { AsyncBoundary } from "../../shell/AsyncBoundary";
import { ATOMIC_LIMIT } from "../document/components/ClauseMeter";
import "./traceability.css";

/**
 * Iteraciones tocadas a partir de las cuales un requisito se considera
 * reabierto con frecuencia. Es el tema de esta pantalla: no cuánto acumuló
 * un requisito —eso lo cubre Documento— sino cuántas veces se volvió sobre
 * él.
 */
const REOPEN_THRESHOLD = 3;

const MARK: Record<ProposalOperation, { cls: string; text: string }> = {
  create: { cls: "mark mark--create", text: "A" },
  modify: { cls: "mark mark--modify", text: "M" },
  delete: { cls: "mark mark--modify", text: "B" },
  conflict: { cls: "mark mark--conflict", text: "C" },
};

interface TraceabilityScreenProps {
  projectId: string;
  currentRevision: number;
  meetingDates: Record<number, string>;
  /** Abre la historia del requisito en Documento. */
  onOpenRequirement: (requirementId: string) => void;
}

interface MatrixData {
  revisions: RequirementRevision[];
  snapshots: DocumentEntry[][];
  rejections: Rejection[];
}

/**
 * Matriz requisitos × iteraciones.
 *
 * La pantalla de Documento responde qué dice un requisito ahora; esta responde
 * cuáles reabre cada reunión. Una fila marcada en todas las columnas es la
 * forma que toma la deriva.
 */
export function TraceabilityScreen({
  projectId,
  currentRevision,
  meetingDates,
  onOpenRequirement,
}: TraceabilityScreenProps) {
  const resource = useResource<MatrixData>(
    useCallback(
      async () => ({
        revisions: await fetchRevisions(projectId),
        snapshots: await fetchDocumentSnapshots(projectId, currentRevision),
        rejections: await fetchRejections(projectId),
      }),
      [projectId, currentRevision],
    ),
    [projectId, currentRevision],
  );

  const columns = Array.from({ length: currentRevision }, (_, i) => i + 1);

  return (
    <div className="trace">
      <div className="screen__head">
        <span className="screen__title">Matriz de trazabilidad</span>
        <span className="screen__meta">
          {resource.data?.revisions.length ?? 0} entradas × {currentRevision}{" "}
          iteraciones
        </span>
      </div>

      <AsyncBoundary resource={resource}>
        {(data) => (
          <Matrix
            data={data}
            columns={columns}
            meetingDates={meetingDates}
            onOpenRequirement={onOpenRequirement}
          />
        )}
      </AsyncBoundary>
    </div>
  );
}

function Matrix({
  data,
  columns,
  meetingDates,
  onOpenRequirement,
}: {
  data: MatrixData;
  columns: number[];
  meetingDates: Record<number, string>;
  onOpenRequirement: (requirementId: string) => void;
}) {
  const { revisions, snapshots, rejections } = data;

  const requirementIds = useMemo(
    () => [...new Set(revisions.map((row) => row.requirementId))].sort(),
    [revisions],
  );

  /** Responsabilidades de cada requisito en cada revisión, según la API. */
  const trends = useMemo(
    () =>
      new Map(
        requirementIds.map((id) => [
          id,
          snapshots.map(
            (snapshot) =>
              snapshot.find((entry) => entry.requirementId === id)
                ?.responsibilities ?? null,
          ),
        ]),
      ),
    [requirementIds, snapshots],
  );

  /** Iteraciones distintas en que se tocó cada requisito. */
  const touchedCount = useMemo(() => {
    const seen = new Map<string, Set<number>>();
    for (const row of revisions) {
      const set = seen.get(row.requirementId) ?? new Set<number>();
      set.add(row.revision);
      seen.set(row.requirementId, set);
    }
    return new Map([...seen].map(([id, set]) => [id, set.size]));
  }, [revisions]);

  const reopenedIds = requirementIds.filter(
    (id) => (touchedCount.get(id) ?? 0) >= REOPEN_THRESHOLD,
  );

  /**
   * Marcas de una celda.
   *
   * Un requisito puede haber sido modificado y además ser blanco de una
   * propuesta rechazada en la misma iteración, así que se devuelven todas: el
   * rechazo es justo lo que no puede quedar tapado por un cambio aceptado.
   */
  const marksFor = (requirementId: string, revision: number) => {
    const marks = revisions
      .filter(
        (row) => row.requirementId === requirementId && row.revision === revision,
      )
      .map((row) => MARK[row.operation]);

    for (const rejection of rejections) {
      if (rejection.targetId === requirementId && rejection.iteration === revision) {
        marks.push({ cls: "mark mark--rejected", text: "R" });
      }
    }
    return marks;
  };

  return (
    <>
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
                {columns.map((revision) => (
                  <th key={revision}>
                    Reunión {revision}
                    <small>{meetingDates[revision] ?? ""}</small>
                  </th>
                ))}
                <th>Responsabilidades</th>
              </tr>
            </thead>
            <tbody>
              {requirementIds.map((id) => {
                const trend = trends.get(id) ?? [];
                const last = trend.at(-1);
                const reopened = (touchedCount.get(id) ?? 0) >= REOPEN_THRESHOLD;
                return (
                  <tr key={id} className={reopened ? "matrix__row--reopened" : undefined}>
                    <td className="matrix__id">
                      <button
                        type="button"
                        className="matrix__open"
                        onClick={() => onOpenRequirement(id)}
                        title={`Abrir la historia de ${id} en Documento`}
                      >
                        {id}
                      </button>
                    </td>
                    {columns.map((revision) => {
                      const marks = marksFor(id, revision);
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
                      {last != null && last > ATOMIC_LIMIT && <b> ⚠</b>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {reopenedIds.length > 0 && (
          <p className="matrix__finding">
            <span className="matrix__finding-swatch" aria-hidden="true" />
            {reopenedIds.join(", ")}{" "}
            {reopenedIds.length === 1 ? "se reabrió" : "se reabrieron"} en{" "}
            {REOPEN_THRESHOLD} iteraciones o más. Abrí la historia del requisito
            en Documento para ver qué se le fue agregando.
          </p>
        )}

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

      {rejections.length > 0 && (
        <div className="trace__note">
          <strong>Lo que no quedó escrito.</strong>{" "}
          {rejections.map((entry) => entry.rationale).join(" ")} Una propuesta
          rechazada no deja texto en la especificación, pero sí queda registrada
          acá: la ausencia es un dato del estudio, no un hueco.
        </div>
      )}
    </>
  );
}
