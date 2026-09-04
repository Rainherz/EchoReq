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
 * One requirement candidate proposed from the transcript.
 *
 * Ambiguous candidates show the gap instead of a filled-in rule: the agent
 * reports what was not said rather than inventing a policy to complete the
 * template.
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

  const classes = [
    "candidate",
    ambiguous ? "candidate--ambiguous" : "",
    selected ? "candidate--selected" : "",
    decision ? "candidate--decided" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} onMouseEnter={onSelect} onFocus={onSelect}>
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

      {draft === null ? candidate.content : null}

      {draft !== null && (
        <textarea
          className="candidate__editor"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label={`Editar ${candidate.targetId}`}
        />
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

      {!decision && (
        <div className="candidate__actions">
          {draft === null ? (
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
          ) : (
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
          )}
        </div>
      )}
    </div>
  );
}
