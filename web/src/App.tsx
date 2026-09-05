import { useCallback, useEffect, useState } from "react";
import { AppShell } from "./shell/AppShell";
import type { Section } from "./shell/AppShell";
import { AsyncBoundary } from "./shell/AsyncBoundary";
import { CaptureScreen } from "./requirements/capture/CaptureScreen";
import { DiscoveryScreen } from "./requirements/discovery/DiscoveryScreen";
import { ReviewScreen } from "./requirements/review/ReviewScreen";
import { DocumentScreen } from "./requirements/document/DocumentScreen";
import { IterationsScreen } from "./requirements/iterations/IterationsScreen";
import { ExportScreen } from "./requirements/export/ExportScreen";
import { TraceabilityScreen } from "./requirements/traceability/TraceabilityScreen";
import { fetchQueue, recordDecision } from "./adapters/api/client";
import type { RecordDecisionInput } from "./adapters/api/client";
import { useResource } from "./adapters/api/useResource";
import { discoveryCandidates, discoveryTurns } from "./mocks/descubrimiento";

const PROJECT = "clinica-norte";
const PARTICIPANT = "p-analista-01";
const ITERATION = 3;
const CURRENT_REVISION = 3;

const MEETING_LABELS: Record<string, string> = {
  "m-2026-08-20": "Reunión 1 · relevamiento",
  "m-2026-09-03": "Reunión 2 · recordatorios",
  "m-2026-09-17": "Reunión 3 · cancelaciones",
};

const MEETING_DATES: Record<number, string> = {
  1: "20 ago 2026",
  2: "03 sep 2026",
  3: "17 sep 2026",
};

const CRUMB: Record<Section, string> = {
  sessions: "/ Sesiones",
  discovery: "/ Descubrimiento / Reunión 1",
  review: `/ Revisión / Reunión ${ITERATION}`,
  document: "/ Documento",
  traceability: "/ Trazabilidad",
  iterations: "/ Iteraciones",
  export: "/ Exportar",
};

const SECTIONS = Object.keys(CRUMB) as Section[];

const sectionFromHash = (): Section => {
  const candidate = window.location.hash.replace("#", "") as Section;
  return SECTIONS.includes(candidate) ? candidate : "review";
};

export default function App() {
  const [section, setSection] = useState<Section>(sectionFromHash);

  // El routing por hash evita que un refresh saque al revisor de su pantalla
  // en medio de la cola.
  useEffect(() => {
    const sync = () => setSection(sectionFromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const navigate = (next: Section) => {
    window.location.hash = next;
    setSection(next);
  };

  const queue = useResource(
    useCallback(() => fetchQueue(PROJECT, ITERATION, PARTICIPANT), []),
    [],
  );

  const persist = useCallback(async (input: RecordDecisionInput) => {
    await recordDecision(input);
  }, []);

  return (
    <AppShell
      project="Clínica Norte"
      crumb={CRUMB[section]}
      active={section}
      onNavigate={navigate}
    >
      {section === "sessions" && (
        <CaptureScreen
          meetingLabel="Reunión 1 · relevamiento inicial"
          date="20 ago 2026 · 14:00"
        />
      )}

      {section === "discovery" && (
        <DiscoveryScreen
          participantId={PARTICIPANT}
          turns={discoveryTurns}
          candidates={discoveryCandidates}
        />
      )}

      {section === "review" && (
        <AsyncBoundary
          resource={queue}
          empty={
            <div className="card">
              <div className="card__head">Cola vacía</div>
              <p style={{ margin: "0 0 .7rem", fontSize: ".88rem", lineHeight: 1.55 }}>
                No quedan propuestas pendientes de la iteración {ITERATION} para
                este participante. Las decisiones ya registradas son inmutables:
                para volver a correr la cola hay que recargar el fixture con{" "}
                <code>seed.py --reset</code>.
              </p>
              <button type="button" className="btn btn--small" onClick={queue.reload}>
                Recargar
              </button>
            </div>
          }
        >
          {(items) => (
            <ReviewScreen
              iteration={ITERATION}
              participantId={PARTICIPANT}
              items={items}
              onDecide={persist}
            />
          )}
        </AsyncBoundary>
      )}

      {section === "document" && (
        <DocumentScreen
          projectId={PROJECT}
          currentRevision={CURRENT_REVISION}
          meetingLabels={MEETING_LABELS}
        />
      )}

      {section === "traceability" && (
        <TraceabilityScreen
          projectId={PROJECT}
          currentRevision={CURRENT_REVISION}
          meetingDates={MEETING_DATES}
        />
      )}

      {section === "export" && <ExportScreen projectId={PROJECT} />}

      {section === "iterations" && <IterationsScreen projectId={PROJECT} />}
    </AppShell>
  );
}
