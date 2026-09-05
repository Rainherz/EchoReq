import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "./shell/AppShell";
import type { Section } from "./shell/AppShell";
import { AsyncBoundary } from "./shell/AsyncBoundary";
import { MeetingPicker } from "./shell/MeetingPicker";
import { CaptureScreen } from "./requirements/capture/CaptureScreen";
import { DiscoveryScreen } from "./requirements/discovery/DiscoveryScreen";
import { ReviewScreen } from "./requirements/review/ReviewScreen";
import { DocumentScreen } from "./requirements/document/DocumentScreen";
import { TraceabilityScreen } from "./requirements/traceability/TraceabilityScreen";
import { IterationsScreen } from "./requirements/iterations/IterationsScreen";
import { ExportScreen } from "./requirements/export/ExportScreen";
import {
  correctDecision,
  fetchMeetings,
  fetchQueue,
  fetchTurns,
  recordDecision,
} from "./adapters/api/client";
import type {
  Meeting,
  RecordDecisionInput,
} from "./adapters/api/client";
import type { ReviewAction } from "./requirements/domain/types";
import { useResource } from "./adapters/api/useResource";

const PROJECT = "clinica-norte";
const PARTICIPANT = "p-analista-01";

const SECTIONS: Section[] = [
  "sessions",
  "discovery",
  "review",
  "document",
  "traceability",
  "iterations",
  "export",
];

const SECTION_LABEL: Record<Section, string> = {
  sessions: "Sesiones",
  discovery: "Descubrimiento",
  review: "Revisión",
  document: "Documento",
  traceability: "Trazabilidad",
  iterations: "Iteraciones",
  export: "Exportar",
};

/**
 * Ruta actual.
 *
 * `#document/R-02` abre el documento con ese requisito ya seleccionado: es
 * cómo la matriz de trazabilidad manda a leer la historia de una fila.
 */
interface Route {
  section: Section;
  focus: string | null;
}

function routeFromHash(): Route {
  const [raw, focus] = window.location.hash.replace("#", "").split("/");
  const section = SECTIONS.includes(raw as Section) ? (raw as Section) : "review";
  return { section, focus: focus ? decodeURIComponent(focus) : null };
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [meetingId, setMeetingId] = useState<string | null>(null);

  // El routing por hash evita que un refresh saque al revisor de su pantalla
  // en medio de la cola.
  useEffect(() => {
    const sync = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const navigate = (section: Section, focus?: string) => {
    window.location.hash = focus
      ? `${section}/${encodeURIComponent(focus)}`
      : section;
    setRoute({ section, focus: focus ?? null });
  };

  const meetings = useResource(
    useCallback(() => fetchMeetings(PROJECT, PARTICIPANT), []),
    [],
  );

  // Al abrir se elige la primera reunión con trabajo pendiente; si no queda
  // ninguna, la última procesada.
  const selected: Meeting | null = useMemo(() => {
    const list = meetings.data ?? [];
    if (list.length === 0) return null;
    const explicit = list.find((m) => m.id === meetingId);
    if (explicit) return explicit;
    return list.find((m) => m.pendingProposals > 0) ?? list[list.length - 1];
  }, [meetings.data, meetingId]);

  const iteration = selected?.iteration ?? 1;
  const currentRevision = Math.max(
    1,
    ...(meetings.data ?? []).map((m) => m.iteration),
  );

  const meetingLabels = useMemo(
    () => Object.fromEntries((meetings.data ?? []).map((m) => [m.id, m.label])),
    [meetings.data],
  );

  const meetingDates = useMemo(
    () =>
      Object.fromEntries(
        (meetings.data ?? []).map((m) => [
          m.iteration,
          new Date(m.heldAt).toLocaleDateString("es-AR", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }),
        ]),
      ),
    [meetings.data],
  );

  const selectedId = selected?.id;
  const selectedIteration = selected?.iteration;

  const queue = useResource(
    useCallback(
      () =>
        selectedIteration === undefined
          ? Promise.resolve([])
          : fetchQueue(PROJECT, selectedIteration, PARTICIPANT),
      [selectedIteration],
    ),
    [selectedId],
  );

  // La transcripción completa: Descubrimiento la lee entera para juzgar si
  // los candidatos cubren lo que se habló.
  const turns = useResource(
    useCallback(
      () => (selectedId ? fetchTurns(selectedId) : Promise.resolve([])),
      [selectedId],
    ),
    [selectedId],
  );

  const persist = useCallback(async (input: RecordDecisionInput) => {
    const { id } = await recordDecision(input);
    return id;
  }, []);

  const correct = useCallback(
    async (decisionId: number, intended: ReviewAction, reason: string) => {
      await correctDecision({
        decisionId,
        participantId: PARTICIPANT,
        intendedAction: intended,
        reason,
      });
    },
    [],
  );

  const crumb =
    route.section === "review" || route.section === "discovery"
      ? `/ ${SECTION_LABEL[route.section]} / Reunión ${iteration}`
      : `/ ${SECTION_LABEL[route.section]}`;

  return (
    <AppShell
      project="Clínica Norte"
      crumb={crumb}
      active={route.section}
      onNavigate={(section) => navigate(section)}
      pendingReview={selected?.pendingProposals ?? 0}
      meetingCount={meetings.data?.length ?? 0}
      toolbar={
        meetings.data && meetings.data.length > 0 && selected ? (
          <MeetingPicker
            meetings={meetings.data}
            selectedId={selected.id}
            onSelect={setMeetingId}
          />
        ) : null
      }
    >
      <AsyncBoundary resource={meetings}>
        {() => (
          <>
            {route.section === "sessions" && selected && (
              <CaptureScreen meeting={selected} onChanged={meetings.reload} />
            )}

            {route.section === "discovery" && (
              <AsyncBoundary
                resource={queue}
                empty={
                  <div className="card">
                    <div className="card__head">Sin candidatos</div>
                    <p style={{ margin: 0, fontSize: ".88rem", lineHeight: 1.55 }}>
                      La reunión {iteration} no tiene candidatos pendientes.
                      Generalos con <code>generate.py</code>, o elegí otra
                      reunión arriba.
                    </p>
                  </div>
                }
              >
                {(items) => (
                  <DiscoveryScreen
                    participantId={PARTICIPANT}
                    iteration={iteration}
                    items={items}
                    turns={turns.data ?? []}
                    onDecide={persist}
                  />
                )}
              </AsyncBoundary>
            )}

            {route.section === "review" && (
              <AsyncBoundary
                resource={queue}
                empty={
                  <div className="card">
                    <div className="card__head">Cola vacía</div>
                    <p
                      style={{
                        margin: "0 0 .7rem",
                        fontSize: ".88rem",
                        lineHeight: 1.55,
                      }}
                    >
                      No quedan propuestas pendientes de la reunión {iteration}.
                      Elegí otra arriba, o recargá el fixture con{" "}
                      <code>seed.py --reset</code>.
                    </p>
                    <button
                      type="button"
                      className="btn btn--small"
                      onClick={queue.reload}
                    >
                      Recargar
                    </button>
                  </div>
                }
              >
                {(items) => (
                  <ReviewScreen
                    iteration={iteration}
                    participantId={PARTICIPANT}
                    items={items}
                    onDecide={persist}
                    onCorrect={correct}
                  />
                )}
              </AsyncBoundary>
            )}

            {route.section === "document" && (
              <DocumentScreen
                projectId={PROJECT}
                currentRevision={currentRevision}
                meetingLabels={meetingLabels}
                focusRequirementId={route.focus}
              />
            )}

            {route.section === "traceability" && (
              <TraceabilityScreen
                projectId={PROJECT}
                currentRevision={currentRevision}
                meetingDates={meetingDates}
                onOpenRequirement={(id) => navigate("document", id)}
              />
            )}

            {route.section === "iterations" && (
              <IterationsScreen projectId={PROJECT} />
            )}

            {route.section === "export" && <ExportScreen projectId={PROJECT} />}
          </>
        )}
      </AsyncBoundary>
    </AppShell>
  );
}
