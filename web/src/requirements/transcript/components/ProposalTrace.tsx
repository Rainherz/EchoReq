import type {
  MeetingProposal,
  ProposalConsolidation,
  ProposalDecision,
} from "../../../adapters/api/client";
import { ProposalDiff } from "../../review/components/ProposalDiff";
import { formatSeconds } from "../lib/trace";

const OPERATION: Record<MeetingProposal["operation"], string> = {
  create: "crear",
  modify: "modificar",
  delete: "eliminar",
  conflict: "conflicto",
};

const ACTION: Record<ProposalDecision["action"], { label: string; tone: string }> = {
  accept: { label: "aceptó", tone: "tag--ok" },
  edit: { label: "editó", tone: "tag--warn" },
  reject: { label: "rechazó", tone: "tag--stop" },
};

interface ProposalTraceProps {
  proposal: MeetingProposal;
  /** Es el foco, o lo cita el turno elegido. */
  lit: boolean;
  hasFocus: boolean;
  /** Es el foco elegido directamente. */
  picked: boolean;
  onPick: () => void;
}

function consolidationText(
  c: ProposalConsolidation,
  nameOf: (id: string) => string,
): string {
  if (c.outcome === "drop") return "El equipo sacó el requisito de la especificación.";
  if (c.outcome === "rewrite") return "El equipo redactó una versión propia.";
  return c.chosenFrom
    ? `El equipo adoptó la versión de ${nameOf(c.chosenFrom)}.`
    : "El equipo adoptó una de las versiones.";
}

/**
 * Cómo se tomó una sugerencia del agente: qué propone, con qué turnos se
 * sostiene y qué decidió cada revisor.
 */
export function ProposalTrace({
  proposal,
  lit,
  hasFocus,
  picked,
  onPick,
}: ProposalTraceProps) {
  const nameOf = (id: string): string =>
    proposal.decisions.find((d) => d.participantId === id)?.participantName ?? id;

  const classes = ["ptrace", lit ? "ptrace--lit" : hasFocus ? "ptrace--dim" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <li className={classes} data-proposal={proposal.id}>
      <button
        type="button"
        className="ptrace__head"
        aria-pressed={picked}
        onClick={onPick}
      >
        <span className="ptrace__id">{proposal.id}</span>
        <span className="tag">{OPERATION[proposal.operation]}</span>
        <span className="ptrace__target">{proposal.targetId}</span>
        <span className="ptrace__cites">
          {proposal.sourceTurnIds.length === 1 ? "turno" : "turnos"}{" "}
          {proposal.sourceTurnIds.join(", ")}
        </span>
      </button>

      <div className="ptrace__body">
        <ProposalDiff
          before={proposal.previousContent ?? undefined}
          after={proposal.content ?? undefined}
          beforeLabel={proposal.operation === "delete" ? "Se quitaría" : "Vigente"}
          afterLabel="Propuesto"
          diff={proposal.operation === "modify"}
        />

        {proposal.rationale && (
          <p className="ptrace__why">
            <span className="ptrace__label">Por qué</span>
            {proposal.rationale}
          </p>
        )}

        <div className="ptrace__decisions">
          <span className="ptrace__label">Qué decidió cada revisor</span>
          {proposal.decisions.length === 0 ? (
            <p className="ptrace__none">Nadie la decidió todavía.</p>
          ) : (
            <ul className="ptrace__list">
              {proposal.decisions.map((decision) => {
                const action = ACTION[decision.action];
                return (
                  <li key={decision.participantId} className="pdecision">
                    <span className="pdecision__who">
                      {decision.participantName ?? decision.participantId}
                    </span>
                    <span className={`tag ${action.tone}`}>{action.label}</span>
                    <span className="pdecision__time">
                      en {formatSeconds(decision.seconds)}
                    </span>
                    {decision.action === "edit" && decision.editedContent && (
                      <blockquote className="pdecision__edit">
                        {decision.editedContent}
                      </blockquote>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {proposal.consolidation && (
          <p className="ptrace__final">
            <span className="ptrace__label">Consolidación</span>
            {consolidationText(proposal.consolidation, nameOf)}
            {proposal.consolidation.reason
              ? ` ${proposal.consolidation.reason}`
              : ""}
            {proposal.consolidation.outcome === "rewrite" &&
              proposal.consolidation.content && (
                <blockquote className="pdecision__edit">
                  {proposal.consolidation.content}
                </blockquote>
              )}
          </p>
        )}
      </div>
    </li>
  );
}
