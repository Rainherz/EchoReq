import { useCallback, useMemo, useState } from "react";
import type {
  ChangeProposal,
  ProposalOperation,
  ReviewAction,
  ReviewDecision,
  Turn,
} from "../domain/types";
import { ProposalDiff } from "./components/ProposalDiff";
import { TurnContext } from "./components/TurnContext";
import { SystemSignals } from "./components/SystemSignals";
import { DecisionBar } from "./components/DecisionBar";
import { ReviewTimer } from "./components/ReviewTimer";
import { ReviewSummary } from "./components/ReviewSummary";
import "./review.css";

/** Turns of surrounding context shown on each side of the cited span. */
const CONTEXT_WINDOW = 2;

const OPERATION_LABEL: Record<ProposalOperation, string> = {
  create: "Alta",
  modify: "Modificación",
  delete: "Baja",
  conflict: "Conflicto",
};

interface ReviewScreenProps {
  iteration: number;
  participantId: string;
  proposals: ChangeProposal[];
  turns: Turn[];
}

/**
 * Container for the review queue.
 *
 * Owns the queue position, the presentation timestamp and the decision log.
 * Every child below is presentational.
 */
export function ReviewScreen({
  iteration,
  participantId,
  proposals,
  turns,
}: ReviewScreenProps) {
  const [index, setIndex] = useState(0);
  const [decisions, setDecisions] = useState<ReviewDecision[]>([]);
  // Set when a proposal is put on screen. Never reset by opening the editor:
  // the interval of record runs from first presentation to final decision.
  const [presentedAt, setPresentedAt] = useState(() => Date.now());

  const proposal = proposals[index];

  const contextTurns = useMemo(() => {
    if (!proposal) return [];
    const positions = proposal.sourceTurnIds
      .map((id) => turns.findIndex((turn) => turn.id === id))
      .filter((position) => position >= 0);
    if (positions.length === 0) return [];
    const from = Math.max(0, Math.min(...positions) - CONTEXT_WINDOW);
    const to = Math.min(turns.length, Math.max(...positions) + CONTEXT_WINDOW + 1);
    return turns.slice(from, to);
  }, [proposal, turns]);

  const decide = useCallback(
    (action: ReviewAction, editedContent?: string) => {
      if (!proposal) return;
      setDecisions((current) => [
        ...current,
        {
          proposalId: proposal.id,
          participantId,
          action,
          presentedAt,
          decidedAt: Date.now(),
          editedContent,
        },
      ]);
      setIndex((current) => current + 1);
      setPresentedAt(Date.now());
    },
    [proposal, participantId, presentedAt],
  );

  const restart = useCallback(() => {
    setDecisions([]);
    setIndex(0);
    setPresentedAt(Date.now());
  }, []);

  if (!proposal) {
    return (
      <div className="review">
        <ReviewSummary decisions={decisions} onRestart={restart} />
      </div>
    );
  }

  const isConflict = proposal.operation === "conflict";

  return (
    <div className="review">
      <div className="review__head">
        <span className="review__title">
          Propuesta {index + 1} de {proposals.length}
        </span>

        <span className="progress" aria-label={`${index} decididas`}>
          {proposals.map((item, position) => (
            <span
              key={item.id}
              className={
                position < index
                  ? "progress__dot progress__dot--done"
                  : position === index
                    ? "progress__dot progress__dot--now"
                    : "progress__dot"
              }
            />
          ))}
        </span>

        <span className="review__ops">
          <span className={isConflict ? "tag tag--stop" : "tag"}>
            {OPERATION_LABEL[proposal.operation]}
          </span>
          <span className="tag">{proposal.targetId}</span>
          <ReviewTimer presentedAt={presentedAt} />
        </span>
      </div>

      <div className="card">
        <div className="card__head">
          {isConflict ? "Conflicto detectado" : "Cambio propuesto"}
          <span className="card__count">iteración {iteration}</span>
        </div>
        <ProposalDiff
          before={proposal.previousContent}
          after={proposal.content}
          beforeLabel={
            isConflict
              ? `${proposal.targetId} vigente`
              : `Vigente · revisión ${iteration - 1}`
          }
          afterLabel={
            isConflict
              ? "Lo que se dijo en esta reunión"
              : `Propuesto · revisión ${iteration}`
          }
          diff={proposal.operation === "modify"}
        />
      </div>

      <div className="review__split">
        <div className="card">
          <div className="card__head">
            Origen · contexto de la cita
            <span className="card__count">
              turnos {proposal.sourceTurnIds.join(", ")}
            </span>
          </div>
          <TurnContext turns={contextTurns} citedIds={proposal.sourceTurnIds} />
        </div>

        <div className="card">
          <div className="card__head">
            Señales del sistema
            <span className="card__count">{proposal.signals.length}</span>
          </div>
          <SystemSignals signals={proposal.signals} />
          <DecisionBar proposedContent={proposal.content} onDecide={decide} />
        </div>
      </div>
    </div>
  );
}
