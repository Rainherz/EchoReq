import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type {
  AgreementRow,
  Participant,
  consolidate,
} from "../../../adapters/api/client";
import { diffAgainst } from "../lib/diff";
import type { DiffPart } from "../lib/diff";
import { disagreement, groupByText, initialsOf, namesOf } from "../lib/versions";
import type { VersionGroup } from "../lib/versions";

type ConsolidateInput = Parameters<typeof consolidate>[1];

/** Los mismos topes que valida el servidor, para no llegar a un 422. */
const REASON_MIN = 4;
const REASON_MAX = 400;
const CONTENT_MIN = 10;
const CONTENT_MAX = 2000;

/** Tonos de la paleta categórica ya validada. Son cuatro a propósito: una
    quinta persona cae al neutro en vez de inventarle un color. El nombre va
    escrito siempre al lado, así que el tono nunca porta la identidad solo. */
const VOICES = 4;

/**
 * Qué está por resolverse.
 *
 * Vive en la página y no en un `window.prompt` porque una redacción de
 * requisito no entra en una línea, encadenar dos prompts pierde lo escrito
 * si se cancela el segundo, y ninguno de los dos se puede leer con un lector
 * de pantalla ni mostrar en qué falla lo que se escribió.
 */
type Draft =
  | { outcome: "adopt"; chosenFrom: string; who: string; reason: string }
  | { outcome: "drop"; reason: string }
  | { outcome: "rewrite"; content: string; reason: string };

interface ProposalDetailProps {
  row: AgreementRow;
  participants: Participant[];
  resolvedBy: string;
  detailId: string;
  saving: boolean;
  onResolve: (input: ConsolidateInput) => Promise<void>;
}

function Avatar({
  person,
  index,
}: {
  person: Participant;
  index: number;
}) {
  const voice = index < VOICES ? `voice-${index + 1}` : "voice-none";
  return (
    <span className={`avatar avatar--${voice}`} aria-hidden="true">
      {initialsOf(person.displayName)}
    </span>
  );
}

/** El texto de la versión con lo que agrega y lo que quita marcado.
    `ins` y `del` no son decorativos: traen subrayado y tachado, que son la
    señal que queda cuando el color no llega. */
function DiffText({ parts }: { parts: DiffPart[] }) {
  return (
    <p className="ver__text">
      {parts.map((part, index) =>
        part.kind === "added" ? (
          <ins key={index} className="d d--add">
            {part.text}
          </ins>
        ) : part.kind === "removed" ? (
          <del key={index} className="d d--del">
            {part.text}
          </del>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </p>
  );
}

export function ProposalDetail({
  row,
  participants,
  resolvedBy,
  detailId,
  saving,
  onResolve,
}: ProposalDetailProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);
  const opening = draft?.outcome ?? null;

  // Al abrir un formulario el foco se mueve a su primer campo: con teclado el
  // control recién aparecido queda por detrás del punto de foco actual y
  // habría que tabular toda la fila para alcanzarlo.
  useEffect(() => {
    if (opening === null) return;
    if (opening === "rewrite") areaRef.current?.focus();
    else reasonRef.current?.focus();
  }, [opening]);

  const groups = groupByText(participants, row.texts);
  // La referencia es la redacción que más gente escribió. Comparar todo
  // contra la mayoría es lo que hace que el detalle no repita un texto por
  // cada par: cada versión aparece una sola vez, anotada.
  const baseline = groups[0];
  const indexOf = (person: Participant) =>
    participants.findIndex((p) => p.id === person.id);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (draft === null) return;

    const reason = draft.reason.trim();
    if (reason.length < REASON_MIN) {
      setInvalid(
        `El motivo es obligatorio y necesita al menos ${REASON_MIN} caracteres. Sin él, dentro de unos meses el documento tiene una versión y ninguna forma de saber por qué se prefirió.`,
      );
      return;
    }
    if (draft.outcome === "rewrite" && draft.content.trim().length < CONTENT_MIN) {
      setInvalid(
        `La redacción del equipo necesita al menos ${CONTENT_MIN} caracteres.`,
      );
      return;
    }

    setInvalid(null);
    await onResolve(
      draft.outcome === "adopt"
        ? { outcome: "adopt", chosenFrom: draft.chosenFrom, resolvedBy, reason }
        : draft.outcome === "drop"
          ? { outcome: "drop", resolvedBy, reason }
          : {
              outcome: "rewrite",
              content: draft.content.trim(),
              resolvedBy,
              reason,
            },
    );
    setDraft(null);
  };

  const mark = disagreement(row);

  return (
    <section className="detail" id={detailId} aria-label={`Detalle de ${row.targetId}`}>
      <header className="detail__head">
        <h2 className="detail__id">{row.targetId}</h2>
        <span className={mark ? "tag tag--warn" : "tag tag--quiet"}>
          {mark ?? "consenso"}
        </span>
        {row.outcome !== null && <span className="tag tag--ok">consolidada</span>}
        <span className="detail__meta">
          Iteración {row.iteration} · {row.reviewers}{" "}
          {row.reviewers === 1 ? "revisor" : "revisores"} · {groups.length}{" "}
          {groups.length === 1 ? "versión" : "versiones"}
        </span>
        {row.knownDefective && (
          <span className="tag tag--stop">defecto sembrado: {row.defectKind}</span>
        )}
      </header>

      {groups.length === 1 ? (
        <p className="detail__same">
          {mark === "distinta acción"
            ? "Todos dejaron el mismo texto: lo que difiere es la acción, no la redacción. No hay dos versiones que comparar."
            : "Todos dejaron el mismo texto."}
        </p>
      ) : (
        <p className="detail__legend">
          Cada versión se compara contra la que escribió más gente.{" "}
          <ins className="d d--add">Subrayado</ins> es lo que agrega,{" "}
          <del className="d d--del">tachado</del> lo que quita.
        </p>
      )}

      <div className="vers">
        {groups.map((group, position) => (
          <VersionCard
            key={group.authors[0].id}
            group={group}
            baseline={baseline}
            first={position === 0}
            alone={groups.length === 1}
            row={row}
            indexOf={indexOf}
            disabled={saving || draft !== null}
            onAdopt={() => {
              setInvalid(null);
              setDraft({
                outcome: "adopt",
                // La procedencia queda en el primero del grupo: los demás
                // escribieron el mismo texto, así que cualquiera sería igual
                // de cierto, y el motivo escrito es lo que explica la
                // resolución.
                chosenFrom: group.authors[0].id,
                who: namesOf(group.authors),
                reason: "",
              });
            }}
          />
        ))}

        {row.outcome === "rewrite" && (
          <article className="ver ver--chosen">
            <header className="ver__head">
              <span className="ver__who">Redacción del equipo</span>
              <span className="tag tag--ok">rige</span>
            </header>
            <p className="ver__text">{row.consolidatedContent}</p>
          </article>
        )}
      </div>

      {row.outcome === "drop" && (
        <p className="detail__dropped">
          El equipo descartó el requisito: no figura en la especificación.
        </p>
      )}

      <div className="resolve">
        {draft === null ? (
          <>
            <span className="resolve__legend">Si ninguna versión sirve</span>
            <div className="resolve__ops">
              <button
                type="button"
                className="btn btn--small"
                disabled={saving}
                onClick={() => {
                  setInvalid(null);
                  setDraft({ outcome: "drop", reason: "" });
                }}
              >
                Descartar el requisito
              </button>
              <button
                type="button"
                className="btn btn--small"
                disabled={saving}
                onClick={() => {
                  setInvalid(null);
                  setDraft({
                    outcome: "rewrite",
                    content: baseline?.text ?? "",
                    reason: "",
                  });
                }}
              >
                Escribir la versión del equipo
              </button>
            </div>
          </>
        ) : (
          <form className="resolve__form" onSubmit={submit}>
            <p className="resolve__title">
              {draft.outcome === "adopt"
                ? `Hacer regir la versión de ${draft.who}`
                : draft.outcome === "drop"
                  ? `Sacar ${row.targetId} de la especificación`
                  : `Redactar la versión del equipo para ${row.targetId}`}
            </p>

            {draft.outcome === "rewrite" && (
              <label className="resolve__field">
                <span className="label">Texto que va a regir</span>
                <textarea
                  ref={areaRef}
                  className="field resolve__area"
                  maxLength={CONTENT_MAX}
                  value={draft.content}
                  onChange={(event) =>
                    setDraft({ ...draft, content: event.target.value })
                  }
                />
              </label>
            )}

            <label className="resolve__field">
              <span className="label">Por qué se resolvió así</span>
              <input
                ref={reasonRef}
                className="field"
                type="text"
                maxLength={REASON_MAX}
                value={draft.reason}
                placeholder="Queda registrado junto con la resolución"
                onChange={(event) =>
                  setDraft({ ...draft, reason: event.target.value })
                }
              />
              <span className="resolve__count">
                {draft.reason.length}/{REASON_MAX}
              </span>
            </label>

            {invalid && (
              <p className="resolve__error" role="alert">
                {invalid}
              </p>
            )}

            <div className="resolve__ops">
              <button
                type="submit"
                className="btn btn--small btn--primary"
                disabled={saving}
              >
                {saving ? "Guardando…" : "Confirmar"}
              </button>
              <button
                type="button"
                className="btn btn--small"
                disabled={saving}
                onClick={() => {
                  setDraft(null);
                  setInvalid(null);
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>

      {row.consolidationReason && (
        <p className="detail__resolved">
          Se resolvió por: {row.consolidationReason}
        </p>
      )}

      <p className="detail__rule">
        Las decisiones de los revisores son inmutables y quedan como están. La
        consolidación se apoya encima y sólo registra qué versión rige en el
        documento y por qué.
      </p>
    </section>
  );
}

function VersionCard({
  group,
  baseline,
  first,
  alone,
  row,
  indexOf,
  disabled,
  onAdopt,
}: {
  group: VersionGroup;
  baseline: VersionGroup | undefined;
  first: boolean;
  /** Única versión: no hay contra qué comparar, así que tampoco hay nada de
      qué ser referencia. */
  alone: boolean;
  row: AgreementRow;
  indexOf: (person: Participant) => number;
  disabled: boolean;
  onAdopt: () => void;
}) {
  const chosen =
    row.outcome === "adopt" &&
    group.authors.some((author) => author.id === row.chosenFrom);
  const diff =
    first || baseline === undefined
      ? null
      : diffAgainst(baseline.text, group.text);
  const solo = group.authors.length === 1;
  const quienes = namesOf(group.authors);

  return (
    <article className={chosen ? "ver ver--chosen" : "ver"}>
      <header className="ver__head">
        <span className="ver__avatars">
          {group.authors.map((author) => (
            <Avatar key={author.id} person={author} index={indexOf(author)} />
          ))}
        </span>
        <span className="ver__who">{quienes}</span>
        {diff === null ? (
          alone ? null : <span className="tag tag--quiet">referencia</span>
        ) : (
          <span className="tag tag--warn">
            {diff.changes} {diff.changes === 1 ? "cambio" : "cambios"}
          </span>
        )}
        {chosen && <span className="tag tag--ok">rige</span>}
      </header>

      {diff === null ? (
        <p className="ver__text">{group.text}</p>
      ) : (
        <DiffText parts={diff.parts} />
      )}

      {!chosen && (
        <div className="ver__ops">
          <button
            type="button"
            className="btn btn--small"
            disabled={disabled}
            onClick={onAdopt}
          >
            {solo ? `Usar la versión de ${quienes}` : "Hacer regir esta versión"}
          </button>
        </div>
      )}
    </article>
  );
}
