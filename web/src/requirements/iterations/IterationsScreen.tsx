import { useCallback } from "react";
import { fetchDrift, fetchMetrics } from "../../adapters/api/client";
import type { DriftPoint, IterationMetrics } from "../../adapters/api/client";
import { useResource } from "../../adapters/api/useResource";
import { AsyncBoundary } from "../../shell/AsyncBoundary";
import { ATOMIC_LIMIT } from "../document/components/ClauseMeter";
import { TrendChart } from "./components/TrendChart";
import type { TrendPoint } from "./components/TrendChart";
import "./iterations.css";

/** Una serie necesita al menos dos puntos para que haya tendencia que leer. */
const MIN_SERIES = 2;

interface Panel {
  drift: DriftPoint[];
  metrics: IterationMetrics[];
}

/**
 * Panel del estudio.
 *
 * Responde las tres preguntas del trabajo, cada una con su propia escala:
 * si el documento se degrada, si el revisor le dedica cada vez menos tiempo,
 * y si eso coincide con aprobar propuestas que se sabían defectuosas.
 */
export function IterationsScreen({ projectId }: { projectId: string }) {
  const panel = useResource<Panel>(
    useCallback(
      async () => ({
        drift: await fetchDrift(projectId),
        metrics: await fetchMetrics(projectId),
      }),
      [projectId],
    ),
    [projectId],
  );

  return (
    <div className="iterations">
      <div className="screen__head">
        <span className="screen__title">Iteraciones del estudio</span>
        <span className="screen__meta">
          {panel.data?.drift.length ?? 0} revisiones ·{" "}
          {panel.data?.metrics.length ?? 0} con revisión registrada
        </span>
      </div>

      <AsyncBoundary resource={panel}>{(data) => <Panels data={data} />}</AsyncBoundary>
    </div>
  );
}

function Panels({ data }: { data: Panel }) {
  const { drift, metrics } = data;

  const decisions = metrics.reduce((sum, m) => sum + m.decisions, 0);
  const defectiveTotal = metrics.reduce((sum, m) => sum + m.defectiveTotal, 0);
  const defectiveAccepted = metrics.reduce((sum, m) => sum + m.defectiveAccepted, 0);
  const lastDrift = drift.at(-1);

  const driftSeries: TrendPoint[] = drift.map((row) => ({
    x: row.revision,
    y: row.meanResponsibilities,
    label: `Reunión ${row.revision}`,
    detail: `${row.meanResponsibilities} responsabilidades por requisito en promedio · máximo ${row.maxResponsibilities} · ${row.overAtomicLimit} sobre el límite`,
  }));

  const timeSeries: TrendPoint[] = metrics.map((row) => ({
    x: row.iteration,
    y: row.medianSeconds,
    label: `Reunión ${row.iteration}`,
    detail: `mediana de ${row.medianSeconds} s sobre ${row.decisions} decisiones · ${row.acceptedWithoutEdit} aceptadas sin editar`,
  }));

  return (
    <>
      <div className="tiles">
        <div className="card">
          <span className="tile__label">Revisiones del documento</span>
          <div className="tile__value">{drift.length}</div>
          <p className="tile__note">
            Una por reunión procesada. La curva de deriva arranca en la segunda.
          </p>
        </div>

        <div className="card">
          <span className="tile__label">Decisiones registradas</span>
          <div className="tile__value">{decisions}</div>
          <p className="tile__note">
            Cada una con su intervalo medido, inmutable una vez guardada.
          </p>
        </div>

        <div className="card">
          <span className="tile__label">Defectuosas aprobadas</span>
          <div
            className={
              defectiveAccepted > 0 ? "tile__value tile__value--stop" : "tile__value"
            }
          >
            {defectiveAccepted}
            <span style={{ fontSize: "1rem", color: "var(--faint)" }}>
              {" "}
              / {defectiveTotal}
            </span>
          </div>
          <p className="tile__note">
            Propuestas que el guion de inyección marcó como incorrectas y se
            aceptaron sin editar.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          Deriva del documento
          <span className="card__count">H1</span>
        </div>
        {driftSeries.length >= MIN_SERIES ? (
          <TrendChart
            points={driftSeries}
            measure="Responsabilidades por requisito, en promedio, al cierre de cada revisión."
            axisLabel="reunión procesada"
            threshold={{ value: ATOMIC_LIMIT, label: "límite" }}
          />
        ) : (
          <NotYet
            label="Responsabilidades por requisito"
            value={lastDrift ? String(lastDrift.meanResponsibilities) : "—"}
            note="Hace falta una segunda revisión para que haya tendencia. Con un solo punto no hay deriva que medir, solo un valor inicial."
          />
        )}
      </div>

      <div className="card">
        <div className="card__head">
          Tiempo de decisión
          <span className="card__count">H2</span>
        </div>
        {timeSeries.length >= MIN_SERIES ? (
          <TrendChart
            points={timeSeries}
            measure="Mediana de segundos entre que la propuesta aparece y el revisor decide."
            axisLabel="reunión procesada"
            unit=" s"
            tone="warn"
          />
        ) : (
          <NotYet
            label="Mediana de decisión"
            value={metrics.length === 1 ? `${metrics[0].medianSeconds} s` : "—"}
            note={
              metrics.length === 0
                ? "Todavía no hay decisiones registradas. Revisá una cola en la pantalla de Revisión para que aparezca el primer punto."
                : "Una sola iteración revisada. La fatiga de revisión es una tendencia: hace falta al menos otra para poder leerla."
            }
          />
        )}
      </div>

      <div className="card">
        <div className="card__head">
          Números por iteración
          <span className="card__count">los mismos datos, sin gráfico</span>
        </div>
        <NumbersTable drift={drift} metrics={metrics} />
      </div>
    </>
  );
}

function NotYet({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="notyet">
      <span className="notyet__label">{label}</span>
      <div className="notyet__value">{value}</div>
      <p className="notyet__note">{note}</p>
    </div>
  );
}

/**
 * Vista tabular de las mismas series.
 *
 * Obligatoria, no opcional: quien no distinga los colores, imprima la
 * pantalla o use un lector tiene que poder leer los mismos números.
 */
function NumbersTable({
  drift,
  metrics,
}: {
  drift: DriftPoint[];
  metrics: IterationMetrics[];
}) {
  const rows = drift.map((row) => ({
    revision: row.revision,
    requirements: row.requirements,
    mean: row.meanResponsibilities,
    max: row.maxResponsibilities,
    over: row.overAtomicLimit,
    metrics: metrics.find((m) => m.iteration === row.revision),
  }));

  return (
    <table className="numbers">
      <thead>
        <tr>
          <th>Iteración</th>
          <th>Requisitos</th>
          <th>Responsab. media</th>
          <th>Máx.</th>
          <th>Sobre el límite</th>
          <th>Decisiones</th>
          <th>Mediana</th>
          <th>Defectuosas</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.revision}>
            <td className="num">Reunión {row.revision}</td>
            <td className="num">{row.requirements}</td>
            <td className="num">{row.mean}</td>
            <td className="num">{row.max}</td>
            <td className="num">{row.over}</td>
            <td className="num">{row.metrics?.decisions ?? "—"}</td>
            <td className="num">
              {row.metrics ? `${row.metrics.medianSeconds} s` : "—"}
            </td>
            <td className="num">
              {row.metrics
                ? `${row.metrics.defectiveAccepted}/${row.metrics.defectiveTotal}`
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
