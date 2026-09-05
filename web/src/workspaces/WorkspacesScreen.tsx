import { useState } from "react";
import { createProject } from "../adapters/api/client";
import type { Project } from "../adapters/api/client";
import type { Resource } from "../adapters/api/useResource";
import { AsyncBoundary } from "../shell/AsyncBoundary";
import "./workspaces.css";

const FORMATS = [
  {
    id: "user-story",
    label: "Historias de usuario",
    note: "Como <rol> quiero <acción> para <beneficio>. Trae el marco QUS de calidad ya operacionalizado.",
  },
  {
    id: "ieee830",
    label: "Especificación IEEE 830",
    note: "Requisitos tabulares. Los criterios de calidad hay que definirlos y anotarlos a mano.",
  },
] as const;

interface WorkspacesScreenProps {
  /** La lista la carga App, que también la usa para reabrir el último. */
  projects: Resource<Project[]>;
  onOpen: (project: Project) => void;
}

/**
 * Entrada de la aplicación: los workspaces del analista.
 *
 * Un workspace es un proyecto de software cuya especificación se mantiene a
 * lo largo de varias reuniones. Todo lo demás —reuniones, propuestas,
 * decisiones, métricas— cuelga de uno.
 */
export function WorkspacesScreen({ projects, onOpen }: WorkspacesScreenProps) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="workspaces">
      <header className="workspaces__head">
        <div>
          <p className="workspaces__eyebrow">EchoReq · instrumento de estudio</p>
          <h1 className="workspaces__title">Proyectos</h1>
          <p className="workspaces__lead">
            Cada proyecto mantiene la especificación de un sistema a lo largo de
            sus reuniones. Las reuniones, las propuestas y las decisiones
            cuelgan de acá.
          </p>
        </div>
        {!creating && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setCreating(true)}
          >
            Nuevo proyecto
          </button>
        )}
      </header>

      {creating && (
        <NewProjectForm
          onCancel={() => setCreating(false)}
          onCreated={(project) => {
            setCreating(false);
            projects.reload();
            onOpen(project);
          }}
        />
      )}

      <AsyncBoundary
        resource={projects}
        empty={
          <div className="workspaces__empty">
            <p className="workspaces__empty-title">Todavía no hay proyectos.</p>
            <p className="workspaces__empty-note">
              Creá el primero para empezar a cargar reuniones.
            </p>
          </div>
        }
      >
        {(items) => (
          <ul className="workspaces__grid">
            {items.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  className="workspace"
                  onClick={() => onOpen(project)}
                >
                  <span className="workspace__name">{project.name}</span>
                  {project.domain && (
                    <span className="workspace__domain">{project.domain}</span>
                  )}
                  <span className="workspace__meta">
                    <span className="tag">
                      {project.format === "ieee830" ? "IEEE 830" : "Historias"}
                    </span>
                    <span className="workspace__count">
                      {project.meetingCount === 0
                        ? "sin reuniones"
                        : `${project.meetingCount} ${
                            project.meetingCount === 1 ? "reunión" : "reuniones"
                          }`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </AsyncBoundary>
    </div>
  );
}

function NewProjectForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (project: Project) => void;
}) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [format, setFormat] = useState<string>("user-story");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setFailure(null);
    try {
      onCreated(await createProject({ name, format, domain }));
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  };

  return (
    <form
      className="card newproject"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="card__head">Nuevo proyecto</div>

      <label className="label" htmlFor="np-name">
        Nombre
      </label>
      <input
        id="np-name"
        className="field"
        value={name}
        autoFocus
        placeholder="Clínica Norte"
        onChange={(event) => setName(event.target.value)}
      />

      <label className="label newproject__spaced" htmlFor="np-domain">
        Dominio
      </label>
      <textarea
        id="np-domain"
        className="field newproject__area"
        value={domain}
        placeholder="Qué sistema es. Una o dos oraciones."
        onChange={(event) => setDomain(event.target.value)}
      />
      <p className="newproject__hint">
        Entra en el prompt de generación: le dice al agente de qué dominio se
        habla, así distingue un requisito de una conversación.
      </p>

      <span className="label newproject__spaced">Formato de la especificación</span>
      <div className="newproject__formats">
        {FORMATS.map((option) => (
          <button
            key={option.id}
            type="button"
            className="newproject__format"
            aria-pressed={format === option.id}
            onClick={() => setFormat(option.id)}
          >
            <span className="newproject__format-label">{option.label}</span>
            <span className="newproject__format-note">{option.note}</span>
          </button>
        ))}
      </div>
      <p className="newproject__hint">
        Se fija una vez para todo el proyecto. La cadena que se mide usa un solo
        formato: cada uno se evalúa con criterios de calidad distintos, y
        mezclarlos haría incomparables las curvas de deriva.
      </p>

      {failure && <p className="newproject__failure">{failure}</p>}

      <div className="decide">
        <button
          type="submit"
          className="btn btn--primary"
          disabled={saving || name.trim().length < 2}
        >
          {saving ? "Creando…" : "Crear proyecto"}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
