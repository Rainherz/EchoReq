import type { Turn } from "../../domain/types";
import type { MeetingProposal } from "../../../adapters/api/client";
import type { SpeakerNames } from "../../review/components/TurnContext";
import { speakerMark } from "../../domain/speaker";

interface TranscriptTurnsProps {
  turns: Turn[];
  speakers: SpeakerNames;
  citers: Map<number, MeetingProposal[]>;
  highlightedTurns: Set<number>;
  /** Hay un foco activo: lo que no está resaltado se atenúa. */
  hasFocus: boolean;
  focusedTurn: number | null;
  onPickTurn: (turnId: number) => void;
}

/**
 * Transcripción completa, un renglón por turno.
 *
 * Los turnos citados por alguna propuesta son botones: tocarlos lleva a las
 * propuestas que los usan. Los demás son texto. Un turno sin cita no tiene
 * a dónde llevar, y un botón que no hace nada es un falso afordance.
 */
export function TranscriptTurns({
  turns,
  speakers,
  citers,
  highlightedTurns,
  hasFocus,
  focusedTurn,
  onPickTurn,
}: TranscriptTurnsProps) {
  const order = [...new Set(turns.map((t) => t.speaker))].sort();
  const tone = (code: string): string => {
    const slot = order.indexOf(code);
    return slot >= 0 && slot < 4 ? `speaker--v${slot + 1}` : "speaker--vx";
  };
  const who = (code: string): string | null => {
    const person = speakers[code];
    if (!person?.role) return null;
    return person.name ? `${person.role} · ${person.name}` : person.role;
  };

  return (
    <div className="ttranscript">
      {turns.map((turn) => {
        const cited = citers.get(turn.id) ?? [];
        const lit = highlightedTurns.has(turn.id);
        const classes = [
          "tturn",
          cited.length > 0 ? "tturn--cited" : "",
          lit ? "tturn--lit" : hasFocus ? "tturn--dim" : "",
        ]
          .filter(Boolean)
          .join(" ");

        const body = (
          <>
            <span className={`speaker ${tone(turn.speaker)}`} aria-hidden="true">
              {speakerMark(turn.speaker)}
            </span>
            <span className="tturn__body">
              <span className="turn__meta">
                {turn.startsAt && `${turn.startsAt} · `}turno {turn.id}
                {who(turn.speaker) ? (
                  <span className={`turn__who ${tone(turn.speaker)}`}>
                    {" · "}
                    {who(turn.speaker)}
                  </span>
                ) : (
                  <span className="turn__who"> · {turn.speaker}</span>
                )}
              </span>
              <span className="tturn__text">{turn.text}</span>
              {cited.length > 0 && (
                <span className="tturn__badges">
                  <span className="tturn__badgelabel">citado por</span>
                  {cited.map((proposal) => (
                    <span key={proposal.id} className="tag tturn__badge">
                      {proposal.id}
                    </span>
                  ))}
                </span>
              )}
            </span>
          </>
        );

        return cited.length > 0 ? (
          <button
            key={turn.id}
            type="button"
            className={classes}
            data-turn={turn.id}
            aria-pressed={focusedTurn === turn.id}
            aria-label={`Turno ${turn.id}, citado por ${cited
              .map((p) => p.id)
              .join(", ")}`}
            onClick={() => onPickTurn(turn.id)}
          >
            {body}
          </button>
        ) : (
          <div key={turn.id} className={classes} data-turn={turn.id}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
