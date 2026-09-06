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
 *
 * The window is built around each citation, so a proposal citing distant
 * turns arrives as several stretches rather than one long span. The gaps
 * between them are drawn: a reviewer must never be able to mistake skipped
 * transcript for transcript they read.
 */
export function TurnContext({ turns, citedIds }: TurnContextProps) {
  const cited = new Set(citedIds);

  return (
    <div>
      {turns.map((turn, position) => {
        const previous = position > 0 ? turns[position - 1] : null;
        const skipped = previous ? turn.id - previous.id - 1 : 0;

        return (
          <div key={turn.id}>
            {skipped > 0 && (
              <p className="turn__gap">
                {skipped} {skipped === 1 ? "turno" : "turnos"} sin relación con
                la cita
              </p>
            )}
            <div className={cited.has(turn.id) ? "turn turn--cited" : "turn"}>
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
          </div>
        );
      })}
    </div>
  );
}
