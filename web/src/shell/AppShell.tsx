import type { ReactNode } from "react";
import "./shell.css";

export type Section =
  | "sessions"
  | "discovery"
  | "review"
  | "document"
  | "traceability"
  | "iterations"
  | "actors"
  | "functions"
  | "agreement"
  | "export";

interface NavEntry {
  id: Section;
  label: string;
  count?: number;
  /** Por qué esta sección no aplica a la reunión elegida. Se sigue pudiendo
      abrir —la pantalla explica el motivo— pero el menú deja de invitar. */
  notApplicable?: string;
}

/** Los contadores salen del estado real; escribirlos a mano los deja
    mintiendo apenas cambian los datos. */
function projectNav(counts: NavCounts): NavEntry[] {
  return [
    { id: "sessions", label: "Sesiones", count: counts.meetings },
    // Descubrimiento existe sólo para la primera reunión de un proyecto,
    // cuando todavía no hay documento contra el cual comparar. Para el resto
    // se atenúa: dejarlo igual que las demás invita a entrar a una pantalla
    // que sólo puede explicar por qué no aplica.
    {
      id: "discovery",
      label: "Descubrimiento",
      notApplicable: counts.discovery
        ? undefined
        : "Sólo para la primera reunión del proyecto",
    },
    { id: "review", label: "Revisión", count: counts.pendingReview },
    { id: "document", label: "Documento" },
    { id: "actors", label: "Roles" },
    { id: "functions", label: "Funciones" },
    { id: "traceability", label: "Trazabilidad" },
  ];
}

interface NavCounts {
  meetings: number;
  pendingReview: number;
  /** La reunión elegida es la de descubrimiento. */
  discovery: boolean;
}

const STUDY_NAV: NavEntry[] = [
  { id: "iterations", label: "Iteraciones" },
  { id: "agreement", label: "Concordancia" },
  { id: "export", label: "Exportar" },
];

interface AppShellProps {
  project: string;
  crumb: string;
  active: Section;
  onNavigate: (section: Section) => void;
  /** Vuelve a la lista de proyectos. */
  onLeaveProject: () => void;
  pendingReview?: number;
  meetingCount?: number;
  /** La reunión elegida corre en modo descubrimiento. */
  discoveryMeeting?: boolean;
  toolbar?: ReactNode;
  /** Quién revisa. Siempre a la vista: cada decisión se le atribuye. */
  identity?: ReactNode;
  /** Arbitra los desacuerdos. Concordancia es su pantalla y de nadie más:
      además de consolidar, ahí se ve el texto que dejó el otro revisor. */
  isLead?: boolean;
  children: ReactNode;
}

export function AppShell({
  project,
  crumb,
  active,
  onNavigate,
  onLeaveProject,
  pendingReview = 0,
  discoveryMeeting = false,
  meetingCount = 0,
  toolbar,
  identity,
  isLead = false,
  children,
}: AppShellProps) {
  const PROJECT_NAV = projectNav({
    meetings: meetingCount,
    pendingReview,
    discovery: discoveryMeeting,
  });
  const renderNav = (entries: NavEntry[]) =>
    entries.map((entry) => (
      <button
        key={entry.id}
        type="button"
        className={
          entry.notApplicable ? "navitem navitem--dim" : "navitem"
        }
        title={entry.notApplicable}
        aria-current={entry.id === active ? "page" : undefined}
        onClick={() => onNavigate(entry.id)}
      >
        <span className="navitem__dot" aria-hidden="true" />
        {entry.label}
        {entry.count !== undefined && entry.count > 0 && (
          <span className="navitem__count">{entry.count}</span>
        )}
      </button>
    ));

  return (
    <div className="shell">
      <header className="topbar">
        <button
          type="button"
          className="topbar__project"
          onClick={onLeaveProject}
          title="Cambiar de proyecto"
        >
          {project}
        </button>
        <span className="topbar__crumb">{crumb}</span>
        <div className="topbar__right">
          {toolbar}
          {identity}
        </div>
      </header>

      <div className="shell__body">
        <nav className="sidebar" aria-label="Secciones">
          <span className="sidebar__group">Proyecto</span>
          {renderNav(PROJECT_NAV)}
          <span className="sidebar__group">Estudio</span>
          {renderNav(STUDY_NAV.filter((entry) => entry.id !== "agreement" || isLead))}
        </nav>

        <main className="main">{children}</main>
      </div>
    </div>
  );
}

export function ScreenStub({ title }: { title: string }) {
  return (
    <div className="stub">
      <div className="stub__title">{title}</div>
      <p className="stub__note">
        Pendiente. La pantalla de Revisión se construye primero porque es la
        única que produce datos del estudio.
      </p>
    </div>
  );
}
