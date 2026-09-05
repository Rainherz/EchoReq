import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeProposal, ReviewAction, ReviewDecision, Turn } from "../domain/types";
import { TurnContext } from "../review/components/TurnContext";
import { CandidateCard } from "./components/CandidateCard";
import "../review/review.css";
import "./discovery.css";

interface DiscoveryScreenProps {
  participantId: string;
  turns: Turn[];
  candidates: ChangeProposal[];
}

/**
 * Discovery mode: the first meeting, with no prior documentation.
 *
 * The agent generates a draft instead of proposing changes, so the interaction
 * differs from the review queue on purpose. Candidates are shown grouped by
 * theme rather than one at a time, because a first draft is judged as a set:
 * whether the themes are covered matters more than each sentence in isolation.
 *
 * That difference is safe here and only here. Revision 1 is calibration and
 * sits outside the drift curve, which starts at iteration 2. The review screen
 * must never adopt this layout.
 */
export function DiscoveryScreen({
  participantId,
  turns,
  candidates,
}: DiscoveryScreenProps) {
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>({});
  const [selectedId, setSelectedId] = useState<string | null>(candidates[0]?.id ?? null);
  const [presentedAt] = useState(() => Date.now());

  const themes = useMemo(() => {
    const grouped = new Map<string, ChangeProposal[]>();
    for (const candidate of candidates) {
      const theme = candidate.theme ?? "Sin tema";
      grouped.set(theme, [...(grouped.get(theme) ?? []), candidate]);
    }
    return [...grouped.entries()];
  }, [candidates]);

  const selected = candidates.find((c) => c.id === selectedId) ?? null;

  const transcriptRef = useRef<HTMLDivElement>(null);

  // En descubrimiento se lee la reunión entera: lo que se evalúa es si los
  // candidatos cubren lo que se habló, no si una cita puntual es correcta.
  // Al elegir un candidato, sus turnos se traen a la vista.
  useEffect(() => {
    if (!selected || !transcriptRef.current) return;
    const first = transcriptRef.current.querySelector(".turn--cited");
    first?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selected]);

  const decide = (
    candidate: ChangeProposal,
    action: ReviewAction,
    editedContent?: string,
  ) => {
    setDecisions((current) => ({
      ...current,
      [candidate.id]: {
        proposalId: candidate.id,
        participantId,
        action,
        presentedAt,
        decidedAt: Date.now(),
        editedContent,
      },
    }));
  };

  const decidedCount = Object.keys(decisions).length;
  const acceptedCount = Object.values(decisions).filter(
    (d) => d.action !== "reject",
  ).length;
  const done = decidedCount === candidates.length;

  return (
    <div className="discovery">
      <div className="screen__head">
        <span className="screen__title">Candidatos a requisito</span>
        <span className="screen__meta">
          reunión 1 · modo descubrimiento · {turns.length} turnos
        </span>
        <span className="screen__ops discovery__progress">
          <span className="bar">
            <i
              className="bar__fill"
              style={{ width: `${(decidedCount / candidates.length) * 100}%` }}
            />
          </span>
          {decidedCount} de {candidates.length} decididos
        </span>
      </div>

      <div className="discovery__split">
        <div className="card discovery__pane">
          <div className="card__head">
            Transcripción completa
            <span className="card__count">
              {selected
                ? `resaltados: turnos ${selected.sourceTurnIds.join(", ")}`
                : `${turns.length} turnos`}
            </span>
          </div>
          <div className="discovery__scroll" ref={transcriptRef}>
            <TurnContext turns={turns} citedIds={selected?.sourceTurnIds ?? []} />
          </div>
        </div>

        <div className="card discovery__pane">
          <div className="card__head">
            Propuestos por el agente
            <span className="card__count">
              {candidates.length} · {themes.length} temas
            </span>
          </div>

          <div className="discovery__scroll">
          {themes.map(([theme, items]) => (
            <div key={theme}>
              <div className="group">
                {theme}
                <span className="group__rule" />
                {items.length}
              </div>
              {items.map((candidate) => (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  selected={candidate.id === selectedId}
                  decision={decisions[candidate.id]?.action}
                  onSelect={() => setSelectedId(candidate.id)}
                  onDecide={(action, edited) => decide(candidate, action, edited)}
                />
              ))}
            </div>
          ))}
          </div>
        </div>
      </div>

      {done && (
        <div className="discovery__note">
          <strong>
            Revisión 1 lista: {acceptedCount} requisitos de {candidates.length}{" "}
            candidatos.
          </strong>{" "}
          Este documento es la línea base que heredan todas las iteraciones
          siguientes. Su calidad se registra como variable moderadora del
          estudio, no como parte de la curva de deriva.
        </div>
      )}
    </div>
  );
}
