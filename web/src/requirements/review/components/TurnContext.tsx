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

  /** Tono por voz, asignado por orden y estable dentro de la reunión.
   *
   *  Hay cuatro y la quinta cae al neutro: con más tonos el piso de
   *  separación para visión normal se cae, y un color que no se distingue no
   *  ayuda a leer. El color es una ayuda para barrer la transcripción, nunca
   *  el portador de la identidad — esa la llevan el código y el rol escritos.
   */
  const orden = [...new Set(turns.map((t) => t.speaker))].sort();
  const tono = (code: string): string => {
    const slot = orden.indexOf(code);
    return slot >= 0 && slot < 4 ? `speaker--v${slot + 1}` : "speaker--vx";
  };

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
              <span className={`speaker ${tono(turn.speaker)}`}>
                {turn.speaker}
              </span>
              <span>
                <span className="turn__meta">
                  {turn.startsAt} · turno {turn.id}
                  {who(turn.speaker) && (
                    <span className={`turn__who ${tono(turn.speaker)}`}>
                      {" · "}
                      {who(turn.speaker)}
                    </span>
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
