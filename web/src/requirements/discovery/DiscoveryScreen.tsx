import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReviewAction, Turn } from "../domain/types";
import type { QueueItem, RecordDecisionInput } from "../../adapters/api/client";
import { TurnContext } from "../review/components/TurnContext";
import { CandidateCard } from "./components/CandidateCard";
import "../review/review.css";
import "./discovery.css";

interface DiscoveryScreenProps {
  participantId: string;
  iteration: number;
  /** Candidatos pendientes, con el contexto de cada cita. */
  items: QueueItem[];
  /** Transcripción completa de la reunión. */
  turns: Turn[];
  /** Persiste la decisión y devuelve su identificador. */
  onDecide: (input: RecordDecisionInput) => Promise<number>;
}

/**
 * Modo descubrimiento: la primera reunión, sin documentación previa.
 *
 * El agente genera un borrador en lugar de proponer cambios, así que la
 * interacción difiere de la cola de revisión a propósito. Los candidatos se
 * muestran agrupados por tema en vez de uno por vez, porque un primer
 * borrador se juzga como conjunto: importa más si los temas están cubiertos
 * que cada oración por separado.
 *
 * Esa diferencia es admisible acá y solo acá. La revisión 1 es calibración y
 * queda fuera de la curva de deriva, que arranca en la iteración 2. La
 * pantalla de Revisión nunca debe adoptar este layout.
 */
export function DiscoveryScreen({
  participantId,
  iteration,
  items,
  turns,
  onDecide,
}: DiscoveryScreenProps) {
  const [decisions, setDecisions] = useState<Record<string, ReviewAction>>({});
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  // Cuándo se le puso enfrente cada candidato.
  //
  // En descubrimiento todos están a la vista al mismo tiempo, así que el
  // momento de presentación de uno es cuando el revisor lo trae al frente:
  // al seleccionarlo, sus turnos se resaltan en la transcripción. Un solo
  // valor para toda la pantalla convertía la latencia en tiempo transcurrido
  // desde que se abrió, que crece solo y no mide ninguna decisión.
  const [openedAt] = useState(() => Date.now());
  const presentedAt = useRef(new Map<string, number>());
  const [failure, setFailure] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const themes = useMemo(() => {
    const grouped = new Map<string, QueueItem[]>();
    for (const candidate of items) {
      const theme = candidate.theme ?? "Sin tema";
      grouped.set(theme, [...(grouped.get(theme) ?? []), candidate]);
    }
    return [...grouped.entries()];
  }, [items]);

  const selected = items.find((c) => c.id === selectedId) ?? null;

  // En descubrimiento se lee la reunión entera: lo que se evalúa es si los
  // candidatos cubren lo que se habló, no si una cita puntual es correcta.
  // Al elegir un candidato, sus turnos se traen a la vista.
  useEffect(() => {
    if (!selected || !transcriptRef.current) return;
    const first = transcriptRef.current.querySelector(".turn--cited");
    first?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selected]);

  // El reloj de un candidato arranca cada vez que vuelve al frente, no la
  // primera: si el revisor lo dejó y volvió, lo que se mide es la vuelta en
  // la que decidió.
  useEffect(() => {
    if (selectedId) presentedAt.current.set(selectedId, Date.now());
  }, [selectedId]);

  const decide = useCallback(
    async (candidate: QueueItem, action: ReviewAction, editedContent?: string) => {
      setFailure(null);
      try {
        await onDecide({
          proposalId: candidate.id,
          participantId,
          action,
          // Sin selección previa el candidato se decidió sin traerlo al
          // frente. Se cuenta desde que se abrió la pantalla, que es lo único
          // cierto: nunca estuvo solo delante del revisor.
          presentedAt:
            presentedAt.current.get(candidate.id) ?? openedAt,
          decidedAt: Date.now(),
          editedContent,
        });
      } catch (cause) {
        // El candidato se queda sin decidir: perder la decisión por un fallo
        // de red sería perder un dato que no se puede reconstruir.
        setFailure(cause instanceof Error ? cause.message : String(cause));
        return;
      }
      setDecisions((current) => ({ ...current, [candidate.id]: action }));
    },
    [onDecide, participantId, openedAt],
  );

  const decidedCount = Object.keys(decisions).length;
  const acceptedCount = Object.values(decisions).filter(
    (action) => action !== "reject",
  ).length;
  const done = items.length > 0 && decidedCount === items.length;

  return (
    <div className="discovery">
      <div className="screen__head">
        <span className="screen__title">Candidatos a requisito</span>
        <span className="screen__meta">
          reunión {iteration} · modo descubrimiento · {turns.length} turnos
        </span>
        <span className="screen__ops discovery__progress">
          <span className="bar">
            <i
              className="bar__fill"
              style={{
                width: `${items.length === 0 ? 0 : (decidedCount / items.length) * 100}%`,
              }}
            />
          </span>
          {decidedCount} de {items.length} decididos
        </span>
      </div>

      {failure && (
        <p className="decide__failure">
          No se registró la decisión: {failure} El candidato sigue pendiente.
        </p>
      )}

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
              {items.length} · {themes.length} temas
            </span>
          </div>

          <div className="discovery__scroll">
            {themes.map(([theme, group]) => (
              <div key={theme}>
                <div className="group">
                  {theme}
                  <span className="group__rule" />
                  {group.length}
                </div>
                {group.map((candidate) => (
                  <CandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    selected={candidate.id === selectedId}
                    decision={decisions[candidate.id]}
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
            Revisión {iteration} lista: {acceptedCount} requisitos de{" "}
            {items.length} candidatos.
          </strong>{" "}
          Este documento es la línea base que heredan todas las iteraciones
          siguientes. Su calidad se registra como variable moderadora del
          estudio, no como parte de la curva de deriva.
        </div>
      )}
    </div>
  );
}
