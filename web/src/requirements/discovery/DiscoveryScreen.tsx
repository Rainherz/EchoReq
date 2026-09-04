import { useMemo, useState } from "react";
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

  const contextTurns = useMemo(() => {
    if (!selected) return turns.slice(0, 8);
    const positions = selected.sourceTurnIds
      .map((id) => turns.findIndex((t) => t.id === id))
      .filter((p) => p >= 0);
    if (positions.length === 0) return turns.slice(0, 8);
    const from = Math.max(0, Math.min(...positions) - 2);
    const to = Math.min(turns.length, Math.max(...positions) + 3);
    return turns.slice(from, to);
  }, [selected, turns]);

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
        <span className="screen__ops">
          <span className="bar">
            <i
              className="bar__fill"
              style={{ width: `${(decidedCount / candidates.length) * 100}%` }}
            />
          </span>
          <span className="screen__meta">
            {decidedCount} de {candidates.length}
          </span>
        </span>
      </div>

      <div className="discovery__split">
        <div className="card discovery__pane">
          <div className="card__head">
            Transcripción
            <span className="card__count">
              {selected ? `turnos ${selected.sourceTurnIds.join(", ")}` : "—"}
            </span>
          </div>
          <TurnContext
            turns={contextTurns}
            citedIds={selected?.sourceTurnIds ?? []}
          />
        </div>

        <div className="card discovery__pane">
          <div className="card__head">
            Propuestos por el agente
            <span className="card__count">
              {candidates.length} · {themes.length} temas
            </span>
          </div>

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
