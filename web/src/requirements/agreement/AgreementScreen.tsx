import { Fragment, useCallback, useState } from "react";
import type { AgreementRow, Participant } from "../../adapters/api/client";
import { fetchAgreement } from "../../adapters/api/client";
import { useResource } from "../../adapters/api/useResource";
import { AsyncBoundary } from "../../shell/AsyncBoundary";
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
}

/**
 * Concordancia entre revisores.
 *
 * Es lo que justifica tener más de uno. Dos series paralelas sobre la misma
 * cola sólo sirven si se pueden cruzar: una propuesta que todos deciden igual
 * y otra que los divide dicen cosas distintas sobre la propuesta, y esa
 * distinción no existe con un solo revisor.
 *
 * No propone resolver los desacuerdos ni unificar las decisiones. El
 * desacuerdo es el dato: si la pantalla ofreciera «unificar», estaría
 * borrando la observación que vino a registrar.
 */
export function AgreementScreen({ projectId, participants }: AgreementScreenProps) {
  // Qué propuesta está abierta. La acción sola no alcanza: dos personas
  // pueden «editar» y escribir cosas distintas, y lo que queda en el
  // documento es el texto, no la etiqueta.
  const [open, setOpen] = useState<string | null>(null);

  const rows = useResource<AgreementRow[]>(
    useCallback(() => fetchAgreement(projectId), [projectId]),
    [projectId],
  );

  return (
    <div className="agreement">
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
                  <table className="agree">
                    <thead>
                      <tr>
                        <th>Iter.</th>
                        <th>Requisito</th>
                        {participants.map((p) => (
                          <th key={p.id}>{p.displayName}</th>
                        ))}
                        <th>Sembrada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cruzadas.map((row) => {
                        const difiere = row.disputed || row.textDiffers;
                        const abierta = open === row.proposalId;
                        return (
                          <Fragment key={row.proposalId}>
                            <tr
                              className={
                                difiere ? "agree--disputed agree__row" : "agree__row"
                              }
                              onClick={() =>
                                setOpen(abierta ? null : row.proposalId)
                              }
                            >
                              <td className="agree__num">{row.iteration}</td>
                              <td className="agree__id">
                                {abierta ? "▾" : "▸"} {row.targetId}
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
                                      <span className="agree__none">—</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="agree__defect">
                                {row.knownDefective ? row.defectKind : ""}
                                {row.textDiffers && !row.disputed && (
                                  <span className="agree__flag">
                                    mismo veredicto, distinto texto
                                  </span>
                                )}
                              </td>
                            </tr>

                            {abierta && (
                              <tr className="agree__detail">
                                <td colSpan={participants.length + 3}>
                                  {participants
                                    .filter((p) => row.texts[p.id] !== undefined)
                                    .map((p) => (
                                      <div key={p.id} className="agree__text">
                                        <span className="agree__who">
                                          {p.displayName}
                                        </span>
                                        <p>{row.texts[p.id]}</p>
                                      </div>
                                    ))}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="step__hint">
                    Hacé clic en una fila para ver el texto que dejó cada uno.
                    Dos personas pueden editar y escribir cosas distintas: lo que
                    queda en el documento es el texto, no la etiqueta.{" "}
                    Las filas resaltadas son las que dividieron a los revisores.
                    No hay forma de unificarlas desde acá a propósito: el
                    desacuerdo es la observación, y resolverlo en la pantalla
                    borraría el dato que vino a registrar.
                  </p>
                </div>
              )}
            </>
          );
        }}
      </AsyncBoundary>
    </div>
  );
}
