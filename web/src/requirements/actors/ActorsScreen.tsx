import { useCallback, useRef, useState } from "react";
import {
  fetchActorDecisions,
  fetchDocument,
  fetchGlossary,
  forgetActorDecision,
  recordActorDecision,
} from "../../adapters/api/client";
import type {
  ActorDecision,
  ActorOutcome,
  GlossaryActor,
} from "../../adapters/api/client";
import type { DocumentEntry } from "../domain/document";
import { useResource } from "../../adapters/api/useResource";
import { AsyncBoundary } from "../../shell/AsyncBoundary";
import { LockedByProgress } from "../../shell/LockedByProgress";
import { DecisionCard } from "./components/DecisionCard";
import { Glossary } from "./components/Glossary";
import { actorRows, isPending, recurringPairs, todosFrom } from "./lib/actors";
import type { ActorRow } from "./lib/actors";
import "./actors.css";

interface ActorsScreenProps {
  projectId: string;
  upToRevision: number;
  /** Todo lo que esta persona puede leer, sin el tope de la reunión elegida:
      los nombres se normalizan sobre el documento entero y no sobre la
      reunión que se está mirando. */
  readableRevision: number;
  blockedAt: number | null;
  onGoReview: () => void;
  onOpenRequirement: (requirementId: string) => void;
}

/**
 * Normalización de nombres de rol.
 *
 * Una historia de usuario tiene un rol. Cuando el documento acumula reuniones
 * el vocabulario se desparrama —la misma persona entra como «especialista» en
 * una y «especialista de la UGEL» en la siguiente— y la trazabilidad por
 * actor deja de existir sin que nada avise.
 *
 * La pantalla no arregla nada, y no puede: el log de requisitos es inmutable
 * y las revisiones ya medidas no se reescriben. Lo que produce son decisiones
 * y una lista de pendientes que se aplican al decidir propuestas de una
 * reunión futura. Por eso no existe el estado «resuelto»: existe «decidido».
 */
export function ActorsScreen({
  projectId,
  upToRevision,
  readableRevision,
  blockedAt,
  onGoReview,
  onOpenRequirement,
}: ActorsScreenProps) {
  const document = useResource(
    useCallback(
      () =>
        readableRevision < 1
          ? Promise.resolve([] as DocumentEntry[])
          : fetchDocument(projectId, readableRevision),
      [projectId, readableRevision],
    ),
    [projectId, readableRevision],
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
      <div className="actors">
        <div className="screen__head">
          <span className="screen__title">Roles</span>
        </div>
        <LockedByProgress
          blockedAt={blockedAt}
          what="El mapa de roles"
          onGo={onGoReview}
        />
      </div>
    );
  }

  // Las tres fuentes se esperan juntas. Con `?? []` la pantalla dibujaba
  // «0 decididos» mientras una de ellas fallaba, y eso es indistinguible de
  // un vacío legítimo: quien mira cree que sabe y no sabe.
  const failure = document.error ?? glossary.error ?? decisions.error;
  if (failure !== null) {
    return (
      <div className="actors">
        <div className="screen__head">
          <span className="screen__title">Roles</span>
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
    <div className="actors">
      <AsyncBoundary resource={document}>
        {(entries) => (
          <Tray
            projectId={projectId}
            entries={entries}
            glossary={glossary.data ?? []}
            decisions={decisions.data ?? []}
            onGlossaryChange={glossary.reload}
            onDecisionsChange={decisions.reload}
            onOpenRequirement={onOpenRequirement}
          />
        )}
      </AsyncBoundary>
    </div>
  );
}

function Tray({
  projectId,
  entries,
  glossary,
  decisions,
  onGlossaryChange,
  onDecisionsChange,
  onOpenRequirement,
}: {
  projectId: string;
  entries: DocumentEntry[];
  glossary: GlossaryActor[];
  decisions: ActorDecision[];
  onGlossaryChange: () => void;
  onDecisionsChange: () => void;
  onOpenRequirement: (requirementId: string) => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const descriptionRef = useRef<HTMLInputElement>(null);

  const rows = actorRows(entries, glossary, decisions);
  const pending = rows.filter(isPending);
  const settled = rows.filter((row) => !isPending(row));
  const todos = todosFrom(rows);
  const patterns = recurringPairs(entries);

  // Requisitos que terminan en cada rol: los que ya lo nombran más los que
  // una decisión mandó ahí. Cero es un rol que nadie pide, y eso es un hueco
  // de la especificación, no un error del glosario.
  const reach = new Map<string, number>();
  for (const role of glossary) reach.set(role.name, 0);
  for (const row of rows) {
    const declared = glossary.find(
      (role) => role.name.toLowerCase() === row.name.toLowerCase(),
    );
    const target = row.declared ? declared?.name : (row.decision?.role ?? null);
    if (target && reach.has(target)) {
      reach.set(target, (reach.get(target) ?? 0) + row.requirements.length);
    }
  }

  const record = async (
    row: ActorRow,
    outcome: ActorOutcome,
    role: string | null,
  ) => {
    setSaving(row.name);
    setFailure(null);
    try {
      await recordActorDecision(projectId, {
        observed: row.name,
        outcome,
        role,
      });
      onDecisionsChange();
      if (outcome === "new") onGlossaryChange();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(null);
    }
  };

  const undo = async (observed: string) => {
    setFailure(null);
    try {
      await forgetActorDecision(projectId, observed);
      onDecisionsChange();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const total = rows.length;
  const done = settled.length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <>
      <div className="screen__head">
        <span className="screen__title">Roles</span>
        <span className="screen__meta">
          {entries.length} requisitos · {total} nombres · {pending.length} sin
          decidir
        </span>
      </div>

      {failure && (
        <p className="decide__failure" role="alert">
          {failure}
        </p>
      )}

      <div className="tray">
        <div className="tray__main">
          <div className="card">
            <div className="card__head">
              Normalización de nombres
              <span className="card__count">
                {done} de {total} decididos
              </span>
            </div>
            {/* La barra mide decisiones tomadas, no texto arreglado: el texto
                no se puede arreglar acá. */}
            <div
              className="progress"
              role="img"
              aria-label={`${done} de ${total} nombres decididos, ${percent} por ciento`}
            >
              <div className="progress__fill" style={{ width: `${percent}%` }} />
            </div>
            <p className="actors__hint">
              Decidir no cambia el documento. Cada decisión deja un pendiente
              que se aplica al revisar una reunión futura, así que esto mide
              criterio tomado, no texto corregido.
            </p>
          </div>

          {patterns.map((pattern) => (
            <div key={pattern.pair.join("|")} className="card">
              <div className="card__head">
                Patrón recurrente
                <span className="card__count">
                  {pattern.requirements.length} requisitos
                </span>
              </div>
              <p className="actors__hint">
                «{pattern.pair[0]} o {pattern.pair[1]}» aparece{" "}
                {pattern.requirements.length} veces. Eso no son{" "}
                {pattern.requirements.length} descuidos: es un rol que nadie
                nombró, o son dos historias metidas en una.
              </p>
              <div className="actor__reqs">
                {pattern.requirements.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="actor__req"
                    onClick={() => onOpenRequirement(id)}
                  >
                    {id}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="card">
            <div className="card__head">
              Sin decidir
              <span className="card__count">{pending.length}</span>
            </div>
            {glossary.length === 0 ? (
              <p className="actors__hint">
                Antes de decidir hace falta contra qué comparar. Declará los
                roles del proyecto en el glosario.
              </p>
            ) : pending.length === 0 ? (
              <p className="actors__hint">
                No queda ningún nombre sin decidir. Lo que sigue está en los
                pendientes, y se aplica al revisar la próxima reunión.
              </p>
            ) : (
              <div className="decisions">
                {pending.map((row) => (
                  <DecisionCard
                    key={row.name}
                    row={row}
                    glossary={glossary}
                    saving={saving === row.name}
                    onRecord={(outcome, role) => record(row, outcome, role)}
                    onOpenRequirement={onOpenRequirement}
                  />
                ))}
              </div>
            )}
          </div>

        <div className="card">
          <div className="card__head">
            Pendientes de aplicar
            <span className="card__count">{todos.length}</span>
          </div>
          {todos.length === 0 ? (
            <p className="actors__hint">
              Todavía no hay nada que aplicar. Aparece acá a medida que se
              decide.
            </p>
          ) : (
            <>
              <p className="actors__hint">
                Al revisar la próxima reunión, estos requisitos tendrían que
                quedar con el nombre decidido.
              </p>
              <ul className="todos">
                {todos.map((todo) => (
                  <li
                    key={`${todo.requirementId}-${todo.observed}`}
                    className="todos__item"
                  >
                    <button
                      type="button"
                      className="actor__req"
                      onClick={() => onOpenRequirement(todo.requirementId)}
                    >
                      {todo.requirementId}
                    </button>
                    <span className="todos__what">
                      dice «{todo.observed}»
                      {todo.shouldSay &&
                        ` · debería decir «${todo.shouldSay}»`}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

          {settled.length > 0 && (
            <div className="card">
              <div className="card__head">
                Ya decididos
                <span className="card__count">{settled.length}</span>
              </div>
              <ul className="settled">
                {settled.map((row) => (
                  <li key={row.name} className="settled__item">
                    <span className="settled__name">{row.name}</span>
                    <span className="settled__what">
                      {row.declared
                        ? "coincide con un rol declarado"
                        : row.decision?.outcome === "same"
                          ? `es ${row.decision.role}`
                          : row.decision?.outcome === "new"
                            ? "rol propio, ya declarado"
                            : `rol equivocado${
                                row.decision?.role
                                  ? `, sería ${row.decision.role}`
                                  : ""
                              }`}
                    </span>
                    <span className="settled__uses">
                      {row.requirements.length}
                    </span>
                    {row.decision && (
                      <button
                        type="button"
                        className="glossary__drop"
                        onClick={() => undo(row.name)}
                      >
                        rehacer
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="tray__rail">
          <Glossary
            projectId={projectId}
            actors={glossary}
            reach={reach}
            name={draftName}
            onName={setDraftName}
            descriptionRef={descriptionRef}
            onChange={onGlossaryChange}
          />

        </aside>
      </div>
    </>
  );
}
