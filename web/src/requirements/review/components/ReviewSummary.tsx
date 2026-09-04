import { decisionSeconds } from "../../domain/types";
import type { ReviewDecision } from "../../domain/types";

const ACTION_LABEL: Record<ReviewDecision["action"], string> = {
  accept: "Aceptada",
  edit: "Editada",
  reject: "Rechazada",
};

const ACTION_TAG: Record<ReviewDecision["action"], string> = {
  accept: "tag tag--ok",
  edit: "tag tag--warn",
  reject: "tag",
};

/**
 * What the instrument recorded for this iteration.
 *
 * Shown once the queue is empty so the timing capture can be verified by
 * hand well before any real study run depends on it.
 */
export function ReviewSummary({
  decisions,
  onRestart,
}: {
  decisions: ReviewDecision[];
  onRestart: () => void;
}) {
  const times = decisions.map(decisionSeconds).sort((a, b) => a - b);
  const median =
    times.length === 0
      ? 0
      : times.length % 2 === 1
        ? times[(times.length - 1) / 2]
        : (times[times.length / 2 - 1] + times[times.length / 2]) / 2;

  const accepted = decisions.filter((d) => d.action === "accept").length;

  return (
    <div className="card">
      <div className="card__head">
        Iteración 3 · revisión completa
        <span className="card__count">{decisions.length} decisiones</span>
      </div>

      <table className="summary__table">
        <thead>
          <tr>
            <th>Propuesta</th>
            <th>Decisión</th>
            <th className="num">Tiempo</th>
            <th className="num">presented_at</th>
            <th className="num">decided_at</th>
          </tr>
        </thead>
        <tbody>
          {decisions.map((decision) => (
            <tr key={decision.proposalId}>
              <td className="num">{decision.proposalId}</td>
              <td>
                <span className={ACTION_TAG[decision.action]}>
                  {ACTION_LABEL[decision.action]}
                </span>
              </td>
              <td className="num">{decisionSeconds(decision).toFixed(1)} s</td>
              <td className="num">{decision.presentedAt}</td>
              <td className="num">{decision.decidedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="summary__note">
        <strong>Mediana de decisión: {median.toFixed(1)} s</strong> · aceptadas
        sin editar: {accepted} de {decisions.length}. Estas dos cifras, por
        iteración, son las que sostienen H2 y H3. Todavía viven en memoria:
        la fase siguiente las persiste en <code>review_decisions</code>.
      </div>

      <div className="decide">
        <button type="button" className="btn btn--small" onClick={onRestart}>
          Reiniciar cola
        </button>
      </div>
    </div>
  );
}
