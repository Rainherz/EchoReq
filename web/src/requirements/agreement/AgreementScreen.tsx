import { useCallback, useState } from "react";
import type { AgreementRow, Participant, consolidate } from "../../adapters/api/client";
import { consolidate as saveConsolidation, fetchAgreement } from "../../adapters/api/client";
import { useResource } from "../../adapters/api/useResource";
import { AsyncBoundary } from "../../shell/AsyncBoundary";
import { ProposalDetail } from "./components/ProposalDetail";
import { ProposalList } from "./components/ProposalList";
import type { Filter } from "./components/ProposalList";
import "./agreement.css";

/** Id de la región de detalle. Fijo porque hay una sola: las filas de la cola
    la referencian con aria-controls y el contenido se reemplaza. */
const DETAIL_ID = "detalle-propuesta";

interface AgreementScreenProps {
  projectId: string;
  participants: Participant[];
  /** Quién está resolviendo. Queda registrado con la adopción. */
  resolvedBy: string;
}

/**
 * Concordancia entre revisores.
 *
 * Es lo que justifica tener más de uno. Dos series paralelas sobre la misma
 * cola sólo sirven si se pueden cruzar: una propuesta que todos deciden igual
 * y otra que los divide dicen cosas distintas sobre la propuesta, y esa
 * distinción no existe con un solo revisor.
 *
 * La cola queda a un lado y la comparación al otro. Antes el detalle se abría
 * dentro de una celda de la tabla, así que el texto heredaba el ancho de la
 * columna y había que toparlo para que se leyera; la comparación necesita
 * espacio horizontal propio, que es justo lo que una celda no puede dar.
 */
export function AgreementScreen({
  projectId,
  participants,
  resolvedBy,
}: AgreementScreenProps) {
  const [saving, setSaving] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("todas");
  const [picked, setPicked] = useState<string | null>(null);

  const rows = useResource<AgreementRow[]>(
    useCallback(() => fetchAgreement(projectId), [projectId]),
    [projectId],
  );

  const resolver = async (
    proposalId: string,
    input: Parameters<typeof consolidate>[1],
  ) => {
    setSaving(proposalId);
    setFailure(null);
    try {
      await saveConsolidation(proposalId, input);
      rows.reload();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="agreement">
      {failure && (
        <p className="decide__failure" role="alert">
          {failure}
        </p>
      )}
      <AsyncBoundary
        resource={rows}
        empty={
          <div className="card">
            <div className="card__head">Sin decisiones todavía</div>
            <p style={{ margin: 0, fontSize: ".88rem", lineHeight: 1.55 }}>
              La concordancia se calcula sobre propuestas ya decididas. Revisá
              una cola para que aparezca la primera fila.
            </p>
          </div>
        }
      >
        {(items) => {
          // Sólo las que miró más de una persona pueden concordar o no; con un
          // revisor la pregunta no se puede hacer.
          const cruzadas = items.filter((row) => row.reviewers > 1);
          const disputadas = cruzadas.filter(
            (row) => row.disputed || row.textDiffers,
          );
          const sembradas = cruzadas.filter((row) => row.knownDefective);
          const sembradasDisputadas = sembradas.filter((row) => row.disputed);

          // Derivada y no guardada: así la selección nunca queda apuntando a
          // una propuesta que el filtro o una recarga sacaron de la lista.
          const selected =
            cruzadas.find((row) => row.proposalId === picked) ?? cruzadas[0] ?? null;

          return (
            <>
              <div className="tiles">
                <div className="card">
                  <span className="tile__label">Revisadas por más de uno</span>
                  <div className="tile__value">{cruzadas.length}</div>
                  <p className="tile__note">de {items.length} decididas en total</p>
                </div>
                <div className="card">
                  <span className="tile__label">Con desacuerdo</span>
                  <div className="tile__value">{disputadas.length}</div>
                  <p className="tile__note">
                    {cruzadas.length > 0
                      ? `${Math.round(
                          (1 - disputadas.length / cruzadas.length) * 100,
                        )}% de coincidencia`
                      : "sin base para comparar"}
                  </p>
                </div>
                <div className="card">
                  <span className="tile__label">Sembradas que dividieron</span>
                  <div className="tile__value">
                    {sembradasDisputadas.length}
                    <span className="tile__of"> / {sembradas.length}</span>
                  </div>
                  <p className="tile__note">
                    un defecto que divide es un defecto difícil
                  </p>
                </div>
              </div>

              {selected === null ? (
                <div className="card">
                  <div className="card__head">Todavía no hay con qué comparar</div>
                  <p style={{ margin: 0, fontSize: ".88rem", lineHeight: 1.55 }}>
                    Ninguna propuesta fue revisada por más de una persona. La
                    concordancia necesita que dos revisores decidan sobre la
                    misma cola.
                  </p>
                </div>
              ) : (
                <div className="bench">
                  <ProposalList
                    rows={cruzadas}
                    participants={participants}
                    filter={filter}
                    onFilter={setFilter}
                    selected={selected.proposalId}
                    onSelect={setPicked}
                    detailId={DETAIL_ID}
                  />
                  <ProposalDetail
                    key={selected.proposalId}
                    row={selected}
                    participants={participants}
                    resolvedBy={resolvedBy}
                    detailId={DETAIL_ID}
                    saving={saving === selected.proposalId}
                    onResolve={(input) => resolver(selected.proposalId, input)}
                  />
                </div>
              )}
            </>
          );
        }}
      </AsyncBoundary>
    </div>
  );
}
