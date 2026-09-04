import type { QualitySignal } from "../../domain/types";

/**
 * Rule-based quality signals.
 *
 * Advisory by design: signals inform the decision, they never block or
 * auto-correct it. An enforced rule would measure the rule instead of the
 * reviewer.
 */
export function SystemSignals({ signals }: { signals: QualitySignal[] }) {
  if (signals.length === 0) {
    return <p className="signal--none">Sin observaciones de las reglas.</p>;
  }

  return (
    <div>
      {signals.map((signal) => (
        <div key={signal.rule} className="signal">
          <div className="signal__head">
            <span className="tag tag--warn">{signal.label}</span>
          </div>
          {signal.detail}
        </div>
      ))}
    </div>
  );
}
