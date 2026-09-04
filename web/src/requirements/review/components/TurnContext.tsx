import type { Turn } from "../../domain/types";

interface TurnContextProps {
  turns: Turn[];
  citedIds: number[];
}

/**
 * Transcript window around the cited turns.
 *
 * Context is mandatory, not a convenience: without it the reviewer cannot
 * verify the citation and defaults to trusting the agent — which is exactly
 * the behaviour the study needs to be able to tell apart.
 */
export function TurnContext({ turns, citedIds }: TurnContextProps) {
  const cited = new Set(citedIds);

  return (
    <div>
      {turns.map((turn) => (
        <div
          key={turn.id}
          className={cited.has(turn.id) ? "turn turn--cited" : "turn"}
        >
          <span className={`speaker speaker--${turn.speaker}`}>
            {turn.speaker}
          </span>
          <span>
            <span className="turn__meta">
              {turn.startsAt} · turno {turn.id}
            </span>
            {turn.text}
          </span>
        </div>
      ))}
    </div>
  );
}
