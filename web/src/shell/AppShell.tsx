import type { ReactNode } from "react";
import "./shell.css";

export type Section =
  | "sessions"
  | "review"
  | "document"
  | "traceability"
  | "iterations"
  | "export";

interface NavEntry {
  id: Section;
  label: string;
  count?: number;
}

const PROJECT_NAV: NavEntry[] = [
  { id: "sessions", label: "Sesiones", count: 3 },
  { id: "review", label: "Revisión", count: 5 },
  { id: "document", label: "Documento" },
  { id: "traceability", label: "Trazabilidad" },
];

const STUDY_NAV: NavEntry[] = [
  { id: "iterations", label: "Iteraciones" },
  { id: "export", label: "Exportar" },
];

interface AppShellProps {
  project: string;
  crumb: string;
  active: Section;
  onNavigate: (section: Section) => void;
  toolbar?: ReactNode;
  children: ReactNode;
}

export function AppShell({
  project,
  crumb,
  active,
  onNavigate,
  toolbar,
  children,
}: AppShellProps) {
  const renderNav = (entries: NavEntry[]) =>
    entries.map((entry) => (
      <button
        key={entry.id}
        type="button"
        className="navitem"
        aria-current={entry.id === active ? "page" : undefined}
        onClick={() => onNavigate(entry.id)}
      >
        <span className="navitem__dot" aria-hidden="true" />
        {entry.label}
        {entry.count !== undefined && (
          <span className="navitem__count">{entry.count}</span>
        )}
      </button>
    ));

  return (
    <div className="shell">
      <header className="topbar">
        <span className="topbar__project">{project}</span>
        <span className="topbar__crumb">{crumb}</span>
        <div className="topbar__right">
          {toolbar}
          <span className="avatar" title="Analista">
            AN
          </span>
        </div>
      </header>

      <div className="shell__body">
        <nav className="sidebar" aria-label="Secciones">
          <span className="sidebar__group">Proyecto</span>
          {renderNav(PROJECT_NAV)}
          <span className="sidebar__group">Estudio</span>
          {renderNav(STUDY_NAV)}
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
