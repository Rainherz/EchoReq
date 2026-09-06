import type { Turn } from "../../domain/types";

/** Quién es cada voz. El rol orienta la lectura; el nombre, cuando está,
    dice a quién se le escuchó decir eso. */
export type SpeakerNames = Record<
  string,
  { role: string | null; name: string | null }
>;

interface TurnContextProps {
  turns: Turn[];
  citedIds: number[];
  speakers?: SpeakerNames;
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
export function TurnContext({
  turns,
  citedIds,
  speakers = {},
}: TurnContextProps) {
  const cited = new Set(citedIds);

  /** Rol y nombre, en ese orden: quién es importa más que cómo se llama para
      juzgar si lo dicho sostiene un requisito. */
  const who = (code: string): string | null => {
    const person = speakers[code];
    if (!person?.role) return null;
    return person.name ? `${person.role} · ${person.name}` : person.role;
  };

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
                  {who(turn.speaker) && (
                    <span className="turn__who"> · {who(turn.speaker)}</span>
                  )}
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
