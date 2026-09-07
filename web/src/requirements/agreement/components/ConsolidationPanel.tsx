import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { AgreementRow, Participant, consolidate } from "../../../adapters/api/client";

type ConsolidateInput = Parameters<typeof consolidate>[1];

/** Los mismos topes que valida el servidor, para no llegar a un 422. */
const REASON_MIN = 4;
const REASON_MAX = 400;
const CONTENT_MIN = 10;
const CONTENT_MAX = 2000;

/**
 * Qué está por resolverse.
 *
 * Vive en el panel y no en un `window.prompt` porque una redacción de
 * requisito no entra en una línea, encadenar dos prompts pierde lo escrito
 * si se cancela el segundo, y ninguno de los dos se puede leer con un
 * lector de pantalla ni mostrar en qué falla lo que se escribió.
 */
type Draft =
  | { outcome: "adopt"; chosenFrom: string; who: string; reason: string }
  | { outcome: "drop"; reason: string }
  | { outcome: "rewrite"; content: string; reason: string };

interface VersionGroup {
  /** El texto en sí: es lo que identifica al grupo. */
  text: string;
  /** Quiénes lo dejaron, en el orden en que figuran los participantes. */
  authors: Participant[];
}

/**
 * Agrupa las versiones por texto y no por persona.
 *
 * Dos revisores que coinciden en la redacción producen, en una lista por
 * persona, dos párrafos idénticos y dos botones que hacen exactamente lo
 * mismo; con cinco revisores, cinco. La cantidad de redacciones distintas,
 * en cambio, casi nunca pasa de dos o tres por más gente que revise: es el
 * eje que no crece con el equipo.
 */
function groupByText(
  participants: Participant[],
  texts: Record<string, string>,
): VersionGroup[] {
  const groups: VersionGroup[] = [];
  for (const p of participants) {
    const text = texts[p.id];
    if (text === undefined) continue;
    const existing = groups.find((g) => g.text === text);
    if (existing) existing.authors.push(p);
    else groups.push({ text, authors: [p] });
  }
  return groups;
}

/** «Ana», «Ana y Beto», «Ana, Beto y Carla». */
function namesOf(authors: Participant[]): string {
  const names = authors.map((a) => a.displayName);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;
}

interface ConsolidationPanelProps {
  row: AgreementRow;
  participants: Participant[];
  resolvedBy: string;
  /** Id del panel, para que el disparador lo referencie con aria-controls. */
  panelId: string;
  saving: boolean;
  onResolve: (input: ConsolidateInput) => Promise<void>;
}

/**
 * Detalle de una propuesta: qué texto dejó cada revisor y cómo resolverlo.
 *
 * Las tres salidas conviven porque no son la misma pregunta. Adoptar elige
 * entre lo que ya existe; descartar dice que el requisito no corresponde; y
 * redactar admite que ninguna de las versiones sirve. Forzar las tres a
 * «adoptar» obligaría a elegir la menos mala y dejaría en el documento algo
 * que nadie sostiene.
 */
export function ConsolidationPanel({
  row,
  participants,
  resolvedBy,
  panelId,
  saving,
  onResolve,
}: ConsolidationPanelProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);
  const opening = draft?.outcome ?? null;

  // Al abrir un formulario el foco se mueve a su primer campo: con teclado,
  // el control recién aparecido queda por detrás del punto de foco actual y
  // habría que tabular toda la fila para alcanzarlo.
  useEffect(() => {
    if (opening === null) return;
    if (opening === "rewrite") areaRef.current?.focus();
    else reasonRef.current?.focus();
  }, [opening]);

  const close = () => {
    setDraft(null);
    setInvalid(null);
  };

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
      setInvalid("Falta la redacción del equipo.");
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

  const groups = groupByText(participants, row.texts);

  return (
    <div className="detail" id={panelId}>
      <div className="detail__versions">
        {groups.map((group) => {
          const chosen =
            row.outcome === "adopt" &&
            group.authors.some((a) => a.id === row.chosenFrom);
          const quienes = namesOf(group.authors);
          const solo = group.authors.length === 1;
          return (
            <article
              key={group.authors[0].id}
              className={chosen ? "version version--chosen" : "version"}
            >
              <div className="version__head">
                <span className="version__who">{quienes}</span>
                {chosen && <span className="version__badge">rige</span>}
              </div>
              <p className="version__text">{group.text}</p>
              {!chosen && draft === null && (
                <div className="version__ops">
                  <button
                    type="button"
                    className="btn btn--small"
                    disabled={saving}
                    onClick={(event) => {
                      event.stopPropagation();
                      setInvalid(null);
                      setDraft({
                        outcome: "adopt",
                        // La procedencia queda en el primero del grupo. Los
                        // demás escribieron el mismo texto, así que cualquiera
                        // sería igual de cierto, y el motivo escrito es lo que
                        // explica la resolución.
                        chosenFrom: group.authors[0].id,
                        who: quienes,
                        reason: "",
                      });
                    }}
                  >
                    {solo ? `Usar la versión de ${quienes}` : "Hacer regir esta versión"}
                  </button>
                </div>
              )}
            </article>
          );
        })}

        {row.outcome === "rewrite" && (
          <article className="version version--chosen">
            <div className="version__head">
              <span className="version__who">Redacción del equipo</span>
              <span className="version__badge">rige</span>
            </div>
            <p className="version__text">{row.consolidatedContent}</p>
          </article>
        )}
      </div>

      {groups.length === 1 && row.disputed && (
        <p className="detail__same">
          Todos dejaron el mismo texto: lo que difiere es la acción, no la
          redacción. No hay dos versiones que comparar.
        </p>
      )}

      {row.outcome === "drop" && (
        <p className="detail__dropped">
          El equipo descartó el requisito: no figura en la especificación.
        </p>
      )}

      <div className="detail__team">
        {draft === null ? (
          <>
            <span className="detail__legend">Si ninguna versión sirve</span>
            <div className="detail__ops">
              <button
                type="button"
                className="btn btn--small"
                disabled={saving}
                onClick={(event) => {
                  event.stopPropagation();
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
                onClick={(event) => {
                  event.stopPropagation();
                  setInvalid(null);
                  setDraft({
                    outcome: "rewrite",
                    content: groups[0]?.text ?? "",
                    reason: "",
                  });
                }}
              >
                Escribir la versión del equipo
              </button>
            </div>
          </>
        ) : (
          <form className="resolve" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
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
                  onChange={(e) =>
                    setDraft({ ...draft, content: e.target.value })
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
                onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              />
            </label>

            {invalid && (
              <p className="resolve__error" role="alert">
                {invalid}
              </p>
            )}

            <div className="resolve__ops">
              <button type="submit" className="btn btn--small btn--primary" disabled={saving}>
                {saving ? "Guardando…" : "Confirmar"}
              </button>
              <button
                type="button"
                className="btn btn--small"
                disabled={saving}
                onClick={close}
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
    </div>
  );
}
