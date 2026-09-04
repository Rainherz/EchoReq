import { useCallback, useState } from "react";
import type { ProposalOperation, ReviewAction, ReviewDecision } from "../domain/types";
import type { QueueItem, RecordDecisionInput } from "../../adapters/api/client";
import { ProposalDiff } from "./components/ProposalDiff";
import { TurnContext } from "./components/TurnContext";
import { SystemSignals } from "./components/SystemSignals";
import { DecisionBar } from "./components/DecisionBar";
import { ReviewTimer } from "./components/ReviewTimer";
import { ReviewSummary } from "./components/ReviewSummary";
import "./review.css";

const OPERATION_LABEL: Record<ProposalOperation, string> = {
  create: "Alta",
  modify: "Modificación",
  delete: "Baja",
  conflict: "Conflicto",
};

interface ReviewScreenProps {
  iteration: number;
  participantId: string;
  items: QueueItem[];
  /** Persiste la decisión. Debe rechazar si el backend no la aceptó. */
  onDecide: (input: RecordDecisionInput) => Promise<void>;
}

/**
 * Container de la cola de revisión.
 *
 * Es dueño de la posición en la cola, del instante de presentación y del
 * registro local de decisiones. Todos los hijos son presentacionales.
 */
export function ReviewScreen({
  iteration,
  participantId,
  items,
  onDecide,
}: ReviewScreenProps) {
  const [index, setIndex] = useState(0);
  const [decisions, setDecisions] = useState<ReviewDecision[]>([]);
  // Se fija al mostrar la propuesta y nunca se reinicia al abrir el editor:
  // el intervalo de registro corre desde la primera presentación hasta la
  // decisión final.
  const [presentedAt, setPresentedAt] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const proposal = items[index];

  const decide = useCallback(
    async (action: ReviewAction, editedContent?: string) => {
      if (!proposal || saving) return;

      const decidedAt = Date.now();
      setSaving(true);
      setFailure(null);

      try {
        await onDecide({
          proposalId: proposal.id,
          participantId,
          action,
          presentedAt,
          decidedAt,
          editedContent,
        });
      } catch (cause) {
        // La propuesta se queda en pantalla. Perder una decisión por un
        // fallo de red sería perder un dato que no se puede reconstruir.
        setFailure(cause instanceof Error ? cause.message : String(cause));
        setSaving(false);
        return;
      }

      setDecisions((current) => [
        ...current,
        {
          proposalId: proposal.id,
          participantId,
          action,
          presentedAt,
          decidedAt,
          editedContent,
        },
      ]);
      setIndex((current) => current + 1);
      setPresentedAt(Date.now());
      setSaving(false);
    },
    [proposal, saving, onDecide, participantId, presentedAt],
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
          Propuesta {index + 1} de {items.length}
        </span>

        <span className="progress" aria-label={`${index} decididas`}>
          {items.map((item, position) => (
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
          <TurnContext
            turns={proposal.contextTurns}
            citedIds={proposal.sourceTurnIds}
          />
        </div>

        <div className="card">
          <div className="card__head">
            Señales del sistema
            <span className="card__count">{proposal.signals.length}</span>
          </div>
          <SystemSignals signals={proposal.signals} />

          {failure !== null && (
            <p className="decide__failure">
              No se registró la decisión: {failure} La propuesta sigue en
              pantalla; volvé a decidir cuando el backend responda.
            </p>
          )}

          <DecisionBar
            proposedContent={proposal.content}
            busy={saving}
            onDecide={decide}
          />
        </div>
      </div>
    </div>
  );
}
