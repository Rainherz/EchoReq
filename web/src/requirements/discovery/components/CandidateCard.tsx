import { useState } from "react";
import type { ChangeProposal, ReviewAction } from "../../domain/types";

interface CandidateCardProps {
  candidate: ChangeProposal;
  selected: boolean;
  decision?: ReviewAction;
  onSelect: () => void;
  onDecide: (action: ReviewAction, editedContent?: string) => void;
}

const DECISION_TAG: Record<ReviewAction, { cls: string; label: string }> = {
  accept: { cls: "tag tag--ok", label: "Aceptado" },
  edit: { cls: "tag tag--warn", label: "Editado" },
  reject: { cls: "tag", label: "Descartado" },
};

/**
 * Un candidato a requisito propuesto desde la transcripción.
 *
 * Los ambiguos muestran el hueco en vez de una regla completa: el agente
 * reporta lo que no se dijo en lugar de inventar una política para que la
 * plantilla quede llena.
 *
 * Se selecciona con un click, no al pasar por encima: el hover no existe en
 * pantallas táctiles, y elegir un candidato resalta sus turnos en la
 * transcripción, así que tiene que ser deliberado.
 */
export function CandidateCard({
  candidate,
  selected,
  decision,
  onSelect,
  onDecide,
}: CandidateCardProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const ambiguous = candidate.signals.some((s) => s.rule === "unambiguous");
  const editing = draft !== null;

  const classes = [
    "candidate",
    ambiguous ? "candidate--ambiguous" : "",
    selected ? "candidate--selected" : "",
    decision ? "candidate--decided" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      onClick={selected ? undefined : onSelect}
      role={selected ? undefined : "button"}
      tabIndex={selected ? undefined : 0}
      onKeyDown={(event) => {
        if (!selected && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="candidate__head">
        <span className={ambiguous ? "tag tag--warn" : "tag tag--ok"}>
          {ambiguous ? "Ambiguo" : "Candidato"}
        </span>
        <span className="tag">{candidate.targetId}</span>
        {decision && (
          <span className={DECISION_TAG[decision].cls}>
            {DECISION_TAG[decision].label}
          </span>
        )}
      </div>

      {editing ? (
        <textarea
          className="candidate__editor"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label={`Editar ${candidate.targetId}`}
        />
      ) : (
        candidate.content
      )}

      {candidate.signals.map((signal) => (
        <p key={signal.rule} className="candidate__gap">
          <strong>Falta definir: </strong>
          {signal.detail}
        </p>
      ))}

      <div className="candidate__cite">
        turnos {candidate.sourceTurnIds.join(", ")}
      </div>

      {selected && !decision && (
        <div className="candidate__actions">
          {editing ? (
            <>
              <button
                type="button"
                className="btn btn--small btn--primary"
                onClick={() => onDecide("edit", draft)}
              >
                Guardar
              </button>
              <button
                type="button"
                className="btn btn--small"
                onClick={() => setDraft(null)}
              >
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--small btn--primary"
                onClick={() => onDecide("accept")}
              >
                Aceptar
              </button>
              <button
                type="button"
                className="btn btn--small"
                onClick={() => setDraft(candidate.content ?? "")}
              >
                Editar
              </button>
              <button
                type="button"
                className="btn btn--small"
                onClick={() => onDecide("reject")}
              >
                Descartar
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
