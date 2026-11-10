import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Meeting, MeetingProposal } from "../../adapters/api/client";
import { fetchMeetingProposals } from "../../adapters/api/client";
import { useResource } from "../../adapters/api/useResource";
import type { Resource } from "../../adapters/api/useResource";
import { AsyncBoundary } from "../../shell/AsyncBoundary";
import type { Turn } from "../domain/types";
import type { SpeakerNames } from "../review/components/TurnContext";
import { ProposalTrace } from "./components/ProposalTrace";
import { TranscriptTurns } from "./components/TranscriptTurns";
import { citersByTurn, highlighted } from "./lib/trace";
import type { Focus } from "./lib/trace";
import "../review/review.css";
import "./transcript.css";

interface TranscriptScreenProps {
  meeting: Meeting;
  turns: Resource<Turn[]>;
  speakers: SpeakerNames;
}

/**
 * Transcripción de la reunión junto a lo que el agente propuso a partir de
 * ella y cómo se tomó cada propuesta.
 *
 * Es de lectura. Revisión muestra sólo una ventana alrededor de lo citado y
 * Descubrimiento se vacía cuando todo está decidido; acá la transcripción
 * entera y las decisiones quedan siempre a la vista, para poder auditar de
 * dónde salió cada sugerencia.
 */
export function TranscriptScreen({ meeting, turns, speakers }: TranscriptScreenProps) {
  const proposals = useResource(
    useCallback(() => fetchMeetingProposals(meeting.id), [meeting.id]),
    [meeting.id],
  );

  return (
    <AsyncBoundary
      resource={turns}
      empty={<NoTranscript meeting={meeting} />}
    >
      {(allTurns) => (
        <AsyncBoundary resource={proposals} allowEmpty>
          {(list) => (
            <TranscriptView
              key={meeting.id}
              meeting={meeting}
              turns={allTurns}
              speakers={speakers}
              proposals={list}
            />
          )}
        </AsyncBoundary>
      )}
    </AsyncBoundary>
  );
}

function NoTranscript({ meeting }: { meeting: Meeting }) {
  return (
    <div className="card">
      <div className="card__head">Esta reunión todavía no tiene transcripción</div>
      <p style={{ margin: 0, fontSize: ".88rem", lineHeight: 1.55 }}>
        {meeting.transcriptionStatus === "running"
          ? "La transcripción está en curso. Volvé en unos minutos."
          : "Cargá el audio en Sesiones y corré la transcripción: cuando termine, el texto y las propuestas del agente aparecen acá."}
      </p>
    </div>
  );
}

interface TranscriptViewProps {
  meeting: Meeting;
  turns: Turn[];
  speakers: SpeakerNames;
  proposals: MeetingProposal[];
}

function TranscriptView({ meeting, turns, speakers, proposals }: TranscriptViewProps) {
  const [focus, setFocus] = useState<Focus>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const proposalsRef = useRef<HTMLDivElement>(null);

  const citers = useMemo(() => citersByTurn(proposals), [proposals]);
  const lit = useMemo(
    () => highlighted(focus, proposals, citers),
    [focus, proposals, citers],
  );

  // Se trae a la vista el otro lado de lo que se tocó: tocar una propuesta
  // lleva a sus turnos, tocar un turno lleva a sus propuestas. Lo tocado ya
  // está a la vista, moverlo sería perder el lugar.
  useEffect(() => {
    if (focus === null) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior = calm ? "auto" : "smooth";
    if (focus.kind === "proposal") {
      const first = Math.min(
        ...(proposals.find((p) => p.id === focus.id)?.sourceTurnIds ?? []),
      );
      transcriptRef.current
        ?.querySelector(`[data-turn="${first}"]`)
        ?.scrollIntoView({ block: "center", behavior });
    } else {
      const first = [...lit.proposals][0];
      if (first) {
        proposalsRef.current
          ?.querySelector(`[data-proposal="${CSS.escape(first)}"]`)
          ?.scrollIntoView({ block: "center", behavior });
      }
    }
    // El foco es lo único que dispara el desplazamiento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const toggleProposal = (id: string) =>
    setFocus((current) =>
      current?.kind === "proposal" && current.id === id ? null : { kind: "proposal", id },
    );
  const toggleTurn = (id: number) =>
    setFocus((current) =>
      current?.kind === "turn" && current.id === id ? null : { kind: "turn", id },
    );

  const decided = proposals.filter((p) => p.decisions.length > 0).length;
  const hasProposals = proposals.length > 0;

  return (
    <div className="transcript">
      <div className="screen__head">
        <span className="screen__title">Transcripción</span>
        <span className="screen__meta">
          reunión {meeting.iteration} · {turns.length} turnos ·{" "}
          {proposals.length}{" "}
          {proposals.length === 1 ? "propuesta" : "propuestas"}
          {hasProposals && ` · ${decided} con decisiones`}
        </span>
      </div>

      {!hasProposals && (
        <p className="transcript__note">
          El agente todavía no propuso cambios a partir de esta reunión, así
          que no hay turnos citados ni decisiones que mostrar.
        </p>
      )}

      <div className={hasProposals ? "transcript__split" : "transcript__split transcript__split--solo"}>
        <div className="card transcript__pane">
          <div className="card__head">
            Reunión completa
            <span className="card__count">
              {focus?.kind === "proposal"
                ? `resaltados: turnos ${[...lit.turns].sort((a, b) => a - b).join(", ")}`
                : `${turns.length} turnos`}
            </span>
          </div>
          <div className="transcript__scroll" ref={transcriptRef}>
            <TranscriptTurns
              turns={turns}
              speakers={speakers}
              citers={citers}
              highlightedTurns={lit.turns}
              hasFocus={focus !== null}
              focusedTurn={focus?.kind === "turn" ? focus.id : null}
              onPickTurn={toggleTurn}
            />
          </div>
        </div>

        {hasProposals ? (
          <div className="card transcript__pane">
            <div className="card__head">
              Propuestas del agente
              <span className="card__count">{proposals.length}</span>
            </div>
            <div className="transcript__scroll" ref={proposalsRef}>
              <ul className="ptrace__items">
                {proposals.map((proposal) => (
                  <ProposalTrace
                    key={proposal.id}
                    proposal={proposal}
                    lit={lit.proposals.has(proposal.id)}
                    hasFocus={focus !== null}
                    picked={focus?.kind === "proposal" && focus.id === proposal.id}
                    onPick={() => toggleProposal(proposal.id)}
                  />
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
