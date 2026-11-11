import type { SpeakerCode } from "../../domain/types";
import { speakerMark } from "../../domain/speaker";

export interface Participant {
  code: SpeakerCode;
  name: string;
  /** Share of speaking time attributed by diarisation, 0–1. */
  share: number;
}

/**
 * Speakers detected by diarisation.
 *
 * The share is shown because a badly split speaker is the most common
 * transcription defect, and it has to be caught before the turns become
 * citation units the whole trace depends on.
 */
export function ParticipantList({
  participants,
  ready,
}: {
  participants: Participant[];
  ready: boolean;
}) {
  if (!ready) {
    return (
      <p className="audio__empty">
        Los hablantes se identifican al procesar el audio.
      </p>
    );
  }

  return (
    <div>
      {participants.map((person) => (
        <div key={person.code} className="person">
          <span className={`speaker speaker--${person.code}`} title={person.code}>
            {speakerMark(person.code)}
          </span>
          <span>
            {person.name}
            <span className="person__share">
              voz identificada · {Math.round(person.share * 100)}%
            </span>
          </span>
          <span className="person__meter">
            <i style={{ width: `${person.share * 100}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}
