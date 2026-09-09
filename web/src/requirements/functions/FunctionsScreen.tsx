import { useCallback } from "react";
import {
  fetchActorDecisions,
  fetchDocument,
  fetchGlossary,
} from "../../adapters/api/client";
import type { ActorDecision, GlossaryActor } from "../../adapters/api/client";
import type { DocumentEntry } from "../domain/document";
import { useResource } from "../../adapters/api/useResource";
import { AsyncBoundary } from "../../shell/AsyncBoundary";
import { LockedByProgress } from "../../shell/LockedByProgress";
import { functionRows } from "../actors/lib/actors";
import type { FunctionRow } from "../actors/lib/actors";
import "./functions.css";

interface FunctionsScreenProps {
  projectId: string;
  /** La matriz sigue al selector de reunión: ver cómo el mapa de roles crece
      reunión a reunión es la mitad de para qué existe. Los roles en cambio
      salen del glosario y de las decisiones, que no tienen versión: son la
      interpretación de hoy aplicada a todo el historial. */
  upToRevision: number;
  blockedAt: number | null;
  onGoReview: () => void;
  onGoActors: () => void;
  onOpenRequirement: (requirementId: string) => void;
}

/**
 * Qué pide cada rol, y qué piden varios.
 *
 * Una fila por requisito, una columna por rol. La lista por rol esconde el
 * solapamiento —hay que notar que el mismo requisito aparece en dos bloques
 * distintos—; la matriz lo muestra de una: cualquier fila con dos marcas es
 * una función compartida, que es la pregunta que originó esta pantalla.
 *
 * Sólo es legible después de normalizar. Con los quince nombres crudos serían
 * quince columnas de las cuales tres son la misma persona.
 */
export function FunctionsScreen({
  projectId,
  upToRevision,
  blockedAt,
  onGoReview,
  onGoActors,
  onOpenRequirement,
}: FunctionsScreenProps) {
  const document = useResource(
    useCallback(
      () =>
        upToRevision < 1
          ? Promise.resolve([] as DocumentEntry[])
          : fetchDocument(projectId, upToRevision),
      [projectId, upToRevision],
    ),
    [projectId, upToRevision],
  );
  const glossary = useResource(
    useCallback(() => fetchGlossary(projectId), [projectId]),
    [projectId],
  );
  const decisions = useResource(
    useCallback(() => fetchActorDecisions(projectId), [projectId]),
    [projectId],
  );

  if (upToRevision < 1) {
    return (
      <div className="functions">
        <div className="screen__head">
          <span className="screen__title">Funciones</span>
        </div>
        <LockedByProgress
          blockedAt={blockedAt}
          what="La matriz de funciones"
          onGo={onGoReview}
        />
      </div>
    );
  }

  // Las tres fuentes se esperan juntas: una matriz a la que le falta el
  // glosario dibuja columnas vacías como si nadie pidiera nada.
  const failure = document.error ?? glossary.error ?? decisions.error;
  if (failure !== null) {
    return (
      <div className="functions">
        <div className="screen__head">
          <span className="screen__title">Funciones</span>
        </div>
        <div className="card">
          <div className="card__head">No se pudo cargar</div>
          <p style={{ margin: "0 0 .7rem", fontSize: ".88rem", lineHeight: 1.55 }}>
            {failure}
          </p>
          <button
            type="button"
            className="btn btn--small"
            onClick={() => {
              document.reload();
              glossary.reload();
              decisions.reload();
            }}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="functions">
      <AsyncBoundary resource={document}>
        {(entries) => (
          <Matrix
            revision={upToRevision}
            entries={entries}
            glossary={glossary.data ?? []}
            decisions={decisions.data ?? []}
            onGoActors={onGoActors}
            onOpenRequirement={onOpenRequirement}
          />
        )}
      </AsyncBoundary>
    </div>
  );
}

function Matrix({
  revision,
  entries,
  glossary,
  decisions,
  onGoActors,
  onOpenRequirement,
}: {
  revision: number;
  entries: DocumentEntry[];
  glossary: GlossaryActor[];
  decisions: ActorDecision[];
  onGoActors: () => void;
  onOpenRequirement: (requirementId: string) => void;
}) {
  const rows = functionRows(entries, glossary, decisions);

  // Columnas: los roles que alguien pide, de más a menos. Los transversales
  // van al final —no distinguen a nadie, así que ordenarlos por cantidad los
  // pondría a competir con los de dominio.
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const role of row.roles) {
      counts.set(role, (counts.get(role) ?? 0) + 1);
    }
  }
  const isTransversal = (role: string) =>
    glossary.find((r) => r.name === role)?.transversal ?? false;

  // Un rol transversal no es una columna. La matriz contesta «quién puede
  // hacer qué», y para iniciar sesión la respuesta no es un conjunto de roles
  // sino «cualquiera»: una marca solitaria bajo «Usuario» leería que sólo el
  // Usuario inicia sesión, y su conteo al lado del de un rol de dominio los
  // pondría a competir otra vez.
  const roles = [...counts.keys()]
    .filter((role) => !isTransversal(role))
    .sort(
      (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b),
    );

  const forEveryone = rows.filter(
    (row) => row.roles.length > 0 && row.roles.every(isTransversal),
  );
  const inMatrix = rows.filter((row) => row.roles.some((r) => !isTransversal(r)));
  const shared = inMatrix.filter(
    (row) => row.roles.filter((r) => !isTransversal(r)).length > 1,
  );
  const orphan = rows.filter((row) => row.roles.length === 0);

  // Cuántas formas de escribir había en esta revisión. La matriz muestra los
  // roles ya normalizados, así que se ve más prolija de lo que la reunión fue:
  // cuatro columnas limpias donde en su momento había cinco maneras de
  // nombrar. Decir las dos cifras evita presentar como ordenado algo que no
  // lo estaba.
  const written = new Set(
    entries.flatMap((entry) => (entry.actors ?? []).map((a) => a.toLowerCase())),
  ).size;

  if (roles.length === 0) {
    return (
      <>
        <div className="screen__head">
          <span className="screen__title">Funciones</span>
        </div>
        <div className="card">
          <div className="card__head">Todavía no hay roles resueltos</div>
          <p style={{ margin: "0 0 .9rem", maxWidth: "68ch", lineHeight: 1.6 }}>
            La matriz cruza requisitos contra roles, y los roles salen del
            glosario y de lo que se haya decidido sobre cada nombre. Sin eso
            serían tantas columnas como formas de escribir hay en el
            documento, y varias serían la misma persona.
          </p>
          <button type="button" className="btn btn--small" onClick={onGoActors}>
            Ir a Roles
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="screen__head">
        <span className="screen__title">Funciones</span>
        <span className="screen__meta">
          al cierre de la reunión {revision} · {rows.length} requisitos ·{" "}
          {roles.length} roles de {written} nombres escritos · {shared.length}{" "}
          compartidas · {forEveryone.length} para todos
        </span>
      </div>

      <div className="card">
        <div className="card__head">
          Quién puede hacer qué
          <span className="card__count">una marca por rol que participa</span>
        </div>
        <p className="functions__hint">
          Las columnas son roles ya normalizados: en esta revisión el documento
          usaba <strong>{written}</strong> formas de escribirlos, agrupadas en{" "}
          <strong>{roles.length}</strong>. La tabla se ve más ordenada de lo que
          la reunión fue, y ése es el trabajo de Roles, no un dato de la
          reunión.
        </p>
        <p className="functions__hint">
          Cada fila es una función que pide el cliente. Una fila con dos marcas
          es una función que hacen dos roles distintos: son{" "}
          <strong>
            {shared.length} de {inMatrix.length}
          </strong>
          .
        </p>

        <div className="functions__scroll">
          <table className="grid">
            <caption className="sr-only">
              Requisitos en las filas, roles en las columnas. Una marca indica
              que ese rol pide esa función.
            </caption>
            <thead>
              <tr>
                <th scope="col">Requisito</th>
                <th scope="col">Función</th>
                {roles.map((role) => (
                  <th key={role} scope="col" className="grid__role">
                    <span className="grid__roleName">{role}</span>
                    <span className="grid__roleCount">{counts.get(role)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inMatrix.map((row) => (
                <Row
                  key={row.requirementId}
                  row={row}
                  roles={roles}
                  alsoTransversal={row.roles.filter(isTransversal)}
                  onOpen={() => onOpenRequirement(row.requirementId)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {forEveryone.length > 0 && (
        <div className="card">
          <div className="card__head">
            Funciones de todos
            <span className="card__count">{forEveryone.length}</span>
          </div>
          <p className="functions__hint">
            No dependen de quién sos: las hace cualquiera que entre al sistema.
            Van aparte de la matriz porque ahí tendrían que marcar todas las
            columnas —o una sola, que leería como que sólo un rol puede.
          </p>
          <ul className="functions__orphans">
            {forEveryone.map((row) => (
              <li key={row.requirementId}>
                <button
                  type="button"
                  className="actor__req"
                  onClick={() => onOpenRequirement(row.requirementId)}
                >
                  {row.requirementId}
                </button>
                <span className="functions__everyone">{row.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {orphan.length > 0 && (
        <div className="card">
          <div className="card__head">
            Sin rol resuelto
            <span className="card__count">{orphan.length}</span>
          </div>
          <p className="functions__hint">
            Estos requisitos nombran roles que todavía no se decidieron, así
            que no aparecen en ninguna columna. La matriz los deja afuera en vez
            de inventarles un rol.
          </p>
          <ul className="functions__orphans">
            {orphan.map((row) => (
              <li key={row.requirementId}>
                <button
                  type="button"
                  className="actor__req"
                  onClick={() => onOpenRequirement(row.requirementId)}
                >
                  {row.requirementId}
                </button>
                <span className="functions__orphanWho">
                  {row.undecided.join(" · ")}
                </span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn--small" onClick={onGoActors}>
            Ir a decidirlos
          </button>
        </div>
      )}
    </>
  );
}

function Row({
  row,
  roles,
  alsoTransversal,
  onOpen,
}: {
  row: FunctionRow;
  roles: string[];
  /** Roles transversales que este requisito también nombra. No tienen columna,
      así que sin decirlo acá su participación desaparecería sin dejar rastro.
      Que aparezca es además la señal de que algo está mal declarado: una
      función no puede ser de un rol concreto y de cualquiera a la vez. */
  alsoTransversal: string[];
  onOpen: () => void;
}) {
  return (
    <tr className={row.roles.length > 1 ? "grid__row grid__row--shared" : "grid__row"}>
      <td>
        <button type="button" className="actor__req" onClick={onOpen}>
          {row.requirementId}
        </button>
      </td>
      <td className="grid__label">
        {row.label}
        {alsoTransversal.length > 0 && (
          <span className="grid__mixed">
            también nombra a {alsoTransversal.join(" y ")}, que está declarado
            transversal
          </span>
        )}
      </td>
      {roles.map((role) => {
        const has = row.roles.includes(role);
        return (
          <td key={role} className="grid__cell">
            {has ? (
              <>
                {/* El punto es decorativo: lo que lee un lector de pantalla es
                    el texto de al lado, porque una marca de color sola no dice
                    nada fuera de la pantalla. */}
                <span className="grid__dot" aria-hidden="true" />
                <span className="sr-only">{role} sí</span>
              </>
            ) : (
              <span className="sr-only">{role} no</span>
            )}
          </td>
        );
      })}
    </tr>
  );
}
