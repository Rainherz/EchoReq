import { useCallback } from "react";
import { csvUrl, fetchDatasets } from "../../adapters/api/client";
import type { Dataset } from "../../adapters/api/client";
import { useResource } from "../../adapters/api/useResource";
import { AsyncBoundary } from "../../shell/AsyncBoundary";
import "./export.css";

const SNIPPET = `import pandas as pd

decisions = pd.read_csv("clinica-norte-decisions.csv", parse_dates=["presented_at", "decided_at"])

# H2: el tiempo de decisión por iteración
decisions.groupby("iteration")["seconds"].median()

# H3: propuestas defectuosas aprobadas sin editar
defectuosas = decisions[decisions.known_defective]
defectuosas.groupby("iteration")["action"].value_counts()`;

/**
 * Salida del instrumento para el análisis.
 *
 * Cada conjunto se descarga como CSV con su diccionario de datos a la vista.
 * Un dataset sin diccionario obliga a adivinar qué significa cada columna seis
 * meses después, cuando ya nadie se acuerda.
 */
export function ExportScreen({ projectId }: { projectId: string }) {
  const datasets = useResource(
    useCallback(() => fetchDatasets(projectId), [projectId]),
    [projectId],
  );

  const total = (datasets.data ?? []).reduce((sum, d) => sum + d.rows, 0);

  return (
    <div className="export">
      <div className="screen__head">
        <span className="screen__title">Exportar datos</span>
        <span className="screen__meta">
          {datasets.data?.length ?? 0} conjuntos · {total} filas en total
        </span>
      </div>

      <AsyncBoundary resource={datasets}>
        {(items) => (
          <>
            {items.map((dataset) => (
              <DatasetCard
                key={dataset.name}
                dataset={dataset}
                href={csvUrl(projectId, dataset.name)}
              />
            ))}

            <div className="card">
              <div className="card__head">Cómo se leen</div>
              <pre className="snippet">{SNIPPET}</pre>
            </div>

            <div className="export__note">
              Los conjuntos salen de tablas de solo anexado: dos exportaciones
              del mismo momento del estudio dan exactamente el mismo archivo.
              Las decisiones ya registradas no se pueden corregir ni borrar, así
              que lo que baja acá es el dato tal como se capturó.
            </div>
          </>
        )}
      </AsyncBoundary>
    </div>
  );
}

function DatasetCard({ dataset, href }: { dataset: Dataset; href: string }) {
  const empty = dataset.rows === 0;

  return (
    <div className={empty ? "card dataset dataset--empty" : "card dataset"}>
      <div>
        <div className="card__head">{dataset.title}</div>
        <p className="dataset__purpose">{dataset.purpose}</p>
      </div>

      <div className="dataset__rows">
        {dataset.rows}
        <small>filas</small>
      </div>

      <div className="dataset__actions">
        {empty ? (
          <span className="download download--muted">Sin datos todavía</span>
        ) : (
          <a className="download" href={href} download>
            ↓ Descargar CSV
          </a>
        )}
        <span className="screen__meta">
          {dataset.columns.length} columnas · {dataset.name}.csv
        </span>
      </div>

      <details className="codebook">
        <summary>Diccionario de datos</summary>
        {dataset.columns.map((column) => (
          <div key={column.name} className="codebook__row">
            <span className="codebook__name">{column.name}</span>
            <span className="codebook__meaning">{column.meaning}</span>
          </div>
        ))}
      </details>
    </div>
  );
}
