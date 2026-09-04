import { useEffect, useState } from "react";
import { AppShell, ScreenStub } from "./shell/AppShell";
import type { Section } from "./shell/AppShell";
import { DiscoveryScreen } from "./requirements/discovery/DiscoveryScreen";
import { ReviewScreen } from "./requirements/review/ReviewScreen";
import { DocumentScreen } from "./requirements/document/DocumentScreen";
import { TraceabilityScreen } from "./requirements/traceability/TraceabilityScreen";
import { proposals, turns } from "./mocks/clinica";
import { discoveryCandidates, discoveryTurns } from "./mocks/descubrimiento";
import {
  CURRENT_REVISION,
  MEETINGS,
  rejectedInRevision,
  requirementLog,
} from "./mocks/documento";

const CRUMB: Record<Section, string> = {
  sessions: "/ Sesiones",
  discovery: "/ Descubrimiento / Reunión 1",
  review: "/ Revisión / Reunión 3",
  document: "/ Documento",
  traceability: "/ Trazabilidad",
  iterations: "/ Iteraciones",
  export: "/ Exportar",
};

const STUB_TITLE: Record<string, string> = {
  sessions: "Captura de sesiones",
  iterations: "Iteraciones del estudio",
  export: "Exportar datos",
};

const SECTIONS = Object.keys(CRUMB) as Section[];

const sectionFromHash = (): Section => {
  const candidate = window.location.hash.replace("#", "") as Section;
  return SECTIONS.includes(candidate) ? candidate : "review";
};

export default function App() {
  const [section, setSection] = useState<Section>(sectionFromHash);

  // Hash routing keeps a reload on the screen you were on, which matters
  // during a study run: a refresh must not silently send the reviewer
  // somewhere else mid-queue.
  useEffect(() => {
    const sync = () => setSection(sectionFromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const navigate = (next: Section) => {
    window.location.hash = next;
    setSection(next);
  };

  return (
    <AppShell
      project="Clínica Norte"
      crumb={CRUMB[section]}
      active={section}
      onNavigate={navigate}
    >
      {section === "discovery" && (
        <DiscoveryScreen
          participantId="p-analista-01"
          turns={discoveryTurns}
          candidates={discoveryCandidates}
        />
      )}

      {section === "review" && (
        <ReviewScreen
          iteration={3}
          participantId="p-analista-01"
          proposals={proposals}
          turns={turns}
        />
      )}

      {section === "document" && (
        <DocumentScreen
          log={requirementLog}
          currentRevision={CURRENT_REVISION}
          meetings={MEETINGS}
          rejected={rejectedInRevision}
        />
      )}

      {section === "traceability" && (
        <TraceabilityScreen
          log={requirementLog}
          currentRevision={CURRENT_REVISION}
          meetings={MEETINGS}
          rejected={rejectedInRevision}
        />
      )}

      {(section === "sessions" ||
        section === "iterations" ||
        section === "export") && <ScreenStub title={STUB_TITLE[section]} />}
    </AppShell>
  );
}
