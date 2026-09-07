import { Fragment, useCallback, useState } from "react";
import type { AgreementRow, Participant, consolidate } from "../../adapters/api/client";
import { consolidate as saveConsolidation, fetchAgreement } from "../../adapters/api/client";
import { useResource } from "../../adapters/api/useResource";
import { AsyncBoundary } from "../../shell/AsyncBoundary";
import { ConsolidationPanel } from "./components/ConsolidationPanel";
import "./agreement.css";

const ACTION_LABEL: Record<string, string> = {
  accept: "aceptó",
  edit: "editó",
  reject: "rechazó",
};

const ACTION_CLASS: Record<string, string> = {
  accept: "verdict verdict--accept",
  edit: "verdict verdict--edit",
  reject: "verdict verdict--reject",
};

interface AgreementScreenProps {
  projectId: string;
  participants: Participant[];
  /** Quién está resolviendo. Queda registrado con la adopción. */
  resolvedBy: string;
}

/** Marca de giro del desplegable. Dibujada acá y no con un carácter suelto:
    un glifo hereda la métrica de la fuente y no se puede animar. */
function Chevron() {
  return (
    <svg
      className="agree__chevron"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3.5 1.5 L7 5 L3.5 8.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Concordancia entre revisores.
 *
 * Es lo que justifica tener más de uno. Dos series paralelas sobre la misma
 * cola sólo sirven si se pueden cruzar: una propuesta que todos deciden igual
 * y otra que los divide dicen cosas distintas sobre la propuesta, y esa
 * distinción no existe con un solo revisor.
 *
 * El desacuerdo no se borra: las decisiones son inmutables y siguen ahí. Lo
 * que la pantalla permite es dejar asentado qué versión rige en el documento,
 * en una capa aparte y siempre con un motivo escrito.
 */
export function AgreementScreen({
  projectId,
  participants,
  resolvedBy,
}: AgreementScreenProps) {
  const [saving, setSaving] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // Qué propuesta está abierta. La acción sola no alcanza: dos personas
  // pueden «editar» y escribir cosas distintas, y lo que queda en el
  // documento es el texto, no la etiqueta.
  const [open, setOpen] = useState<string | null>(null);

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
          const cruzadas = items.filter((r) => r.reviewers > 1);
          // Difieren si decidieron distinto o si, decidiendo igual, el texto
          // que dejaron no coincide.
          const disputadas = cruzadas.filter((r) => r.disputed || r.textDiffers);
          const sembradas = cruzadas.filter((r) => r.knownDefective);
          const sembradasDisputadas = sembradas.filter((r) => r.disputed);

          return (
            <>
              <div className="tiles">
                <div className="card">
                  <span className="tile__label">Revisadas por más de uno</span>
                  <div className="tile__value">{cruzadas.length}</div>
                  <p className="tile__note">
                    de {items.length} decididas en total
                  </p>
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

              {cruzadas.length === 0 ? (
                <div className="card">
                  <div className="card__head">Todavía no hay con qué comparar</div>
                  <p style={{ margin: 0, fontSize: ".88rem", lineHeight: 1.55 }}>
                    Ninguna propuesta fue revisada por más de una persona. La
                    concordancia necesita que dos revisores decidan sobre la
                    misma cola.
                  </p>
                </div>
              ) : (
                <div className="card">
                  <div className="card__head">
                    Qué decidió cada uno
                    <span className="card__count">
                      {disputadas.length} desacuerdos
                    </span>
                  </div>

                  <p className="agree__hint">
                    Abrí una fila para ver el texto que dejó cada uno: dos
                    personas pueden editar y escribir cosas distintas, y lo que
                    va al documento es el texto, no la etiqueta. Resolver un
                    desacuerdo no lo borra —las decisiones son inmutables—:
                    deja asentado, aparte y con un motivo, cuál de las
                    versiones rige.
                  </p>

                  <div className="agree__scroll">
                    <table className="agree">
                      <caption className="sr-only">
                        Decisión de cada revisor sobre cada propuesta cruzada.
                        Las filas marcadas «difieren» o «distinto texto» son
                        las que no coincidieron. Cada fila se despliega para
                        comparar los textos y resolver cuál rige.
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Iter.</th>
                          <th scope="col">Requisito</th>
                          {participants.map((p) => (
                            <th scope="col" key={p.id}>
                              {p.displayName}
                            </th>
                          ))}
                          <th scope="col">Sembrada</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cruzadas.map((row) => {
                          const abierta = open === row.proposalId;
                          const panelId = `detalle-${row.proposalId}`;
                          const toggle = () =>
                            setOpen(abierta ? null : row.proposalId);
                          return (
                            <Fragment key={row.proposalId}>
                              <tr
                                className={
                                  row.disputed || row.textDiffers
                                    ? "agree__row agree__row--disputed"
                                    : "agree__row"
                                }
                                onClick={toggle}
                              >
                                <td className="agree__num">{row.iteration}</td>
                                <td className="agree__cell--id">
                                  <button
                                    type="button"
                                    className="agree__toggle"
                                    aria-expanded={abierta}
                                    aria-controls={panelId}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      toggle();
                                    }}
                                  >
                                    <Chevron />
                                    {row.targetId}
                                    {row.disputed && (
                                      <span className="agree__mark">difieren</span>
                                    )}
                                    {row.textDiffers && !row.disputed && (
                                      <span className="agree__mark">
                                        distinto texto
                                      </span>
                                    )}
                                  </button>
                                </td>
                                {participants.map((p) => {
                                  const action = row.decisions[p.id];
                                  return (
                                    <td key={p.id}>
                                      {action ? (
                                        <span className={ACTION_CLASS[action]}>
                                          {ACTION_LABEL[action]}
                                        </span>
                                      ) : (
                                        <span className="agree__none">
                                          <span aria-hidden="true">—</span>
                                          <span className="sr-only">
                                            no la revisó
                                          </span>
                                        </span>
                                      )}
                                    </td>
                                  );
                                })}
                                <td className="agree__defect">
                                  {row.knownDefective ? row.defectKind : ""}
                                </td>
                              </tr>

                              {abierta && (
                                <tr className="agree__detail">
                                  <td colSpan={participants.length + 3}>
                                    <ConsolidationPanel
                                      row={row}
                                      participants={participants}
                                      resolvedBy={resolvedBy}
                                      panelId={panelId}
                                      saving={saving === row.proposalId}
                                      onResolve={(input) =>
                                        resolver(row.proposalId, input)
                                      }
                                    />
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          );
        }}
      </AsyncBoundary>
    </div>
  );
}
