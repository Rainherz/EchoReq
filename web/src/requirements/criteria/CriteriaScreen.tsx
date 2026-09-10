import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import {
  addCriterion,
  fetchCriteria,
  fetchDocument,
  removeCriterion,
} from "../../adapters/api/client";
import type {
  AcceptanceCriterion,
  CriterionKind,
} from "../../adapters/api/client";
import type { DocumentEntry } from "../domain/document";
import { useResource } from "../../adapters/api/useResource";
import { AsyncBoundary } from "../../shell/AsyncBoundary";
import { LockedByProgress } from "../../shell/LockedByProgress";
import "./criteria.css";

interface CriteriaScreenProps {
  projectId: string;
  upToRevision: number;
  blockedAt: number | null;
  /** Quién escribe. Queda registrado con cada criterio: abrirlo a los dos
      revisores después es un cambio de permiso, no una migración. */
  authorId: string;
  onGoReview: () => void;
  onOpenRequirement: (requirementId: string) => void;
}

/**
 * Criterios de aceptación, en formato BDD.
 *
 * SWEBOK v4 §4.5 los lista entre los atributos de un requisito y §4.3
 * describe cómo escribirlos: escenarios «Given / When / Then».
 *
 * Viven aparte de la cola de propuestas por dos razones. Si el agente los
 * propusiera junto con el texto, el revisor tendría más para leer en cada
 * decisión y las medianas de tiempo subirían por una razón que no es fatiga,
 * contaminando la serie de H2. Y §4.3 describe una reunión aparte, anterior a
 * diseño y construcción, no al analista escribiéndolos mientras despacha una
 * cola.
 *
 * La segunda salida —anotar una pregunta en vez de un escenario— no es un
 * hueco del registro: es el dato. La ambigüedad es uno de los dos problemas
 * primarios del capítulo, y contar cuántos requisitos no se pueden convertir
 * en escenario sin preguntar es medirla.
 */
export function CriteriaScreen({
  projectId,
  upToRevision,
  blockedAt,
  authorId,
  onGoReview,
  onOpenRequirement,
}: CriteriaScreenProps) {
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
  const criteria = useResource(
    useCallback(() => fetchCriteria(projectId), [projectId]),
    [projectId],
  );

  if (upToRevision < 1) {
    return (
      <div className="criteria">
        <div className="screen__head">
          <span className="screen__title">Criterios</span>
        </div>
        <LockedByProgress
          blockedAt={blockedAt}
          what="Los criterios de aceptación"
          onGo={onGoReview}
        />
      </div>
    );
  }

  const failure = document.error ?? criteria.error;
  if (failure !== null) {
    return (
      <div className="criteria">
        <div className="screen__head">
          <span className="screen__title">Criterios</span>
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
              criteria.reload();
            }}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="criteria">
      <AsyncBoundary resource={document}>
        {(entries) => (
          <Board
            projectId={projectId}
            revision={upToRevision}
            entries={entries}
            criteria={criteria.data ?? []}
            authorId={authorId}
            onChange={criteria.reload}
            onOpenRequirement={onOpenRequirement}
          />
        )}
      </AsyncBoundary>
    </div>
  );
}

function Board({
  projectId,
  revision,
  entries,
  criteria,
  authorId,
  onChange,
  onOpenRequirement,
}: {
  projectId: string;
  revision: number;
  entries: DocumentEntry[];
  criteria: AcceptanceCriterion[];
  authorId: string;
  onChange: () => void;
  onOpenRequirement: (requirementId: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const forRequirement = (id: string) =>
    criteria.filter((c) => c.requirementId === id);

  const withScenarios = entries.filter((entry) =>
    forRequirement(entry.requirementId).some((c) => c.kind === "scenario"),
  );
  const blocked = entries.filter((entry) =>
    forRequirement(entry.requirementId).some((c) => c.kind === "question"),
  );
  // Un criterio escrito contra una revisión anterior describe un texto que ya
  // cambió: miente en silencio, que es peor que faltar.
  const stale = criteria.filter((c) => {
    const entry = entries.find((e) => e.requirementId === c.requirementId);
    return entry !== undefined && c.writtenAgainst < entry.lastRevision;
  });

  const remove = async (id: number) => {
    setFailure(null);
    try {
      await removeCriterion(projectId, id);
      onChange();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const covered = withScenarios.length;
  const percent =
    entries.length === 0 ? 0 : Math.round((covered / entries.length) * 100);

  return (
    <>
      <div className="screen__head">
        <span className="screen__title">Criterios</span>
        <span className="screen__meta">
          al cierre de la reunión {revision} · {entries.length} requisitos ·{" "}
          {covered} con criterio · {blocked.length} con pregunta abierta
        </span>
      </div>

      {failure && (
        <p className="decide__failure" role="alert">
          {failure}
        </p>
      )}

      <div className="card">
        <div className="card__head">
          Cobertura
          <span className="card__count">
            {covered} de {entries.length}
          </span>
        </div>
        <div
          className="progress"
          role="img"
          aria-label={`${covered} de ${entries.length} requisitos con criterio, ${percent} por ciento`}
        >
          <div className="progress__fill" style={{ width: `${percent}%` }} />
        </div>
        <p className="criteria__hint">
          Un requisito con criterio es uno del que se sabe cuándo está
          terminado. Los que tienen pregunta abierta no se pudieron escribir sin
          volver a consultar: esa cifra es la medida de ambigüedad del
          documento, no una tarea pendiente de alguien.
        </p>
        {stale.length > 0 && (
          <p className="criteria__stale" role="status">
            {stale.length}{" "}
            {stale.length === 1
              ? "criterio quedó desactualizado"
              : "criterios quedaron desactualizados"}
            : se escribieron contra una revisión anterior del requisito, y ese
            texto ya cambió.
          </p>
        )}
      </div>

      <div className="card">
        <div className="card__head">
          Requisitos
          <span className="card__count">
            se escribe contra la revisión {revision}
          </span>
        </div>
        <ul className="crit__list">
          {entries.map((entry) => {
            const mine = forRequirement(entry.requirementId);
            const scenarios = mine.filter((c) => c.kind === "scenario");
            const questions = mine.filter((c) => c.kind === "question");
            const isOpen = open === entry.requirementId;
            const panelId = `crit-${entry.requirementId}`;
            return (
              <li key={entry.requirementId} className="crit">
                <div className="crit__head">
                  <button
                    type="button"
                    className="crit__toggle"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpen(isOpen ? null : entry.requirementId)}
                  >
                    {entry.requirementId}
                  </button>
                  <span className="crit__text">{entry.content}</span>
                  <span className="crit__tags">
                    {scenarios.length > 0 && (
                      <span className="tag tag--ok">
                        {scenarios.length}{" "}
                        {scenarios.length === 1 ? "escenario" : "escenarios"}
                      </span>
                    )}
                    {questions.length > 0 && (
                      <span className="tag tag--warn">
                        {questions.length}{" "}
                        {questions.length === 1 ? "pregunta" : "preguntas"}
                      </span>
                    )}
                    {mine.length === 0 && <span className="tag">sin criterio</span>}
                  </span>
                </div>

                {isOpen && (
                  <div className="crit__panel" id={panelId}>
                    {mine.length > 0 && (
                      <ul className="scen__list">
                        {mine.map((c) => (
                          <li
                            key={c.id}
                            className={
                              c.kind === "question"
                                ? "scen scen--question"
                                : "scen"
                            }
                          >
                            {c.kind === "scenario" ? (
                              <>
                                {c.name && (
                                  <p className="scen__name">{c.name}</p>
                                )}
                                <dl className="scen__body">
                                  <dt>Given</dt>
                                  <dd>{c.context}</dd>
                                  <dt>When</dt>
                                  <dd>{c.stimulus}</dd>
                                  <dt>Then</dt>
                                  <dd>{c.outcome}</dd>
                                </dl>
                              </>
                            ) : (
                              <>
                                <p className="scen__name">Pregunta abierta</p>
                                <p className="scen__question">{c.question}</p>
                                {c.askTo && (
                                  <p className="scen__ask">
                                    Habría que preguntarle a {c.askTo}.
                                  </p>
                                )}
                              </>
                            )}
                            <div className="scen__foot">
                              <span className="scen__rev">
                                escrito contra la revisión {c.writtenAgainst}
                                {c.writtenAgainst < entry.lastRevision &&
                                  " · desactualizado"}
                              </span>
                              <button
                                type="button"
                                className="glossary__drop"
                                onClick={() => remove(c.id)}
                              >
                                sacar
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    <NewCriterion
                      projectId={projectId}
                      requirementId={entry.requirementId}
                      revision={revision}
                      authorId={authorId}
                      onSaved={onChange}
                    />

                    <button
                      type="button"
                      className="btn btn--small"
                      onClick={() => onOpenRequirement(entry.requirementId)}
                    >
                      Ver el requisito
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

/**
 * Escribir un criterio, o admitir que no se puede.
 *
 * Las dos salidas están al mismo nivel a propósito. Si escribir el escenario
 * fuera lo único que la pantalla ofrece, quien no puede terminarlo abandona el
 * requisito sin dejar rastro, y la ambigüedad que encontró se pierde.
 */
function NewCriterion({
  projectId,
  requirementId,
  revision,
  authorId,
  onSaved,
}: {
  projectId: string;
  requirementId: string;
  revision: number;
  authorId: string;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<CriterionKind>("scenario");
  const [name, setName] = useState("");
  const [context, setContext] = useState("");
  const [stimulus, setStimulus] = useState("");
  const [outcome, setOutcome] = useState("");
  const [question, setQuestion] = useState("");
  const [askTo, setAskTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (kind === "scenario" && !(context.trim() && stimulus.trim() && outcome.trim())) {
      setInvalid(
        "Un escenario necesita las tres partes. Si falta una porque todavía no se sabe, esa es la pregunta abierta.",
      );
      return;
    }
    if (kind === "question" && !question.trim()) {
      setInvalid("Anotar una pregunta necesita la pregunta.");
      return;
    }
    setSaving(true);
    setInvalid(null);
    try {
      await addCriterion(projectId, {
        requirementId,
        writtenAgainst: revision,
        kind,
        author: authorId,
        name: name.trim(),
        context: context.trim(),
        stimulus: stimulus.trim(),
        outcome: outcome.trim(),
        question: question.trim(),
        askTo: askTo.trim(),
      });
      setName("");
      setContext("");
      setStimulus("");
      setOutcome("");
      setQuestion("");
      setAskTo("");
      onSaved();
    } catch (cause) {
      setInvalid(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="newcrit" onSubmit={submit}>
      <div className="newcrit__kinds" role="group" aria-label="Qué se agrega">
        <button
          type="button"
          className="btn btn--chip"
          aria-pressed={kind === "scenario"}
          onClick={() => {
            setKind("scenario");
            setInvalid(null);
          }}
        >
          Escenario
        </button>
        <button
          type="button"
          className="btn btn--chip"
          aria-pressed={kind === "question"}
          onClick={() => {
            setKind("question");
            setInvalid(null);
          }}
        >
          No se puede sin preguntar
        </button>
      </div>

      {kind === "scenario" ? (
        <>
          <label className="newcrit__field">
            <span className="label">Nombre del caso</span>
            <input
              className="field"
              type="text"
              maxLength={120}
              value={name}
              placeholder="cuarto intento fallido"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="newcrit__field">
            <span className="label">Given · el contexto</span>
            <input
              className="field"
              type="text"
              maxLength={400}
              value={context}
              placeholder="un usuario con tres intentos fallidos"
              onChange={(e) => setContext(e.target.value)}
            />
          </label>
          <label className="newcrit__field">
            <span className="label">When · el estímulo</span>
            <input
              className="field"
              type="text"
              maxLength={400}
              value={stimulus}
              placeholder="intenta ingresar por cuarta vez"
              onChange={(e) => setStimulus(e.target.value)}
            />
          </label>
          <label className="newcrit__field">
            <span className="label">Then · el resultado</span>
            <input
              className="field"
              type="text"
              maxLength={400}
              value={outcome}
              placeholder="el acceso queda bloqueado 30 minutos"
              onChange={(e) => setOutcome(e.target.value)}
            />
          </label>
        </>
      ) : (
        <>
          <label className="newcrit__field">
            <span className="label">Qué falta saber</span>
            <input
              className="field"
              type="text"
              maxLength={400}
              value={question}
              placeholder="¿cuánto dura el bloqueo temporal?"
              onChange={(e) => setQuestion(e.target.value)}
            />
          </label>
          <label className="newcrit__field">
            <span className="label">A quién preguntarle</span>
            <input
              className="field"
              type="text"
              maxLength={80}
              value={askTo}
              placeholder="al responsable de seguridad"
              onChange={(e) => setAskTo(e.target.value)}
            />
          </label>
        </>
      )}

      {invalid && (
        <p className="resolve__error" role="alert">
          {invalid}
        </p>
      )}

      <button
        type="submit"
        className="btn btn--small btn--primary"
        disabled={saving}
      >
        {saving ? "Guardando…" : kind === "scenario" ? "Agregar escenario" : "Anotar la pregunta"}
      </button>
    </form>
  );
}
