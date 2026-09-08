import { useCallback, useMemo } from "react";
import { fetchDocument } from "../../adapters/api/client";
import type { DocumentEntry } from "../domain/document";
import { useResource } from "../../adapters/api/useResource";
import { AsyncBoundary } from "../../shell/AsyncBoundary";
import { LockedByProgress } from "../../shell/LockedByProgress";
import "./actors.css";

interface ActorsScreenProps {
  projectId: string;
  /** Hasta dónde puede leer esta persona. Cero cierra la pantalla, igual que
      el documento: los actores salen de los requisitos. */
  upToRevision: number;
  blockedAt: number | null;
  onGoReview: () => void;
  onOpenRequirement: (requirementId: string) => void;
}

interface Actor {
  name: string;
  requirements: string[];
}

/**
 * Quién pide qué.
 *
 * Una historia de usuario tiene un rol. Cuando el documento acumula reuniones
 * el vocabulario se desparrama: la misma persona entra como «especialista» en
 * una y como «especialista de la UGEL» en la siguiente, y ahí la trazabilidad
 * por actor deja de existir sin que nada avise.
 *
 * No es una métrica del estudio: es higiene del documento. No propone
 * fusiones ni guarda alias — decidir que dos nombres son la misma persona es
 * juicio de dominio, y el arreglo va en el texto del requisito. Un
 * diccionario de alias dejaría el documento diciendo lo que no quiere decir,
 * prolijo por fuera.
 */
export function ActorsScreen({
  projectId,
  upToRevision,
  blockedAt,
  onGoReview,
  onOpenRequirement,
}: ActorsScreenProps) {
  const document = useResource(
    useCallback(
      () =>
        upToRevision < 1
          ? Promise.resolve([] as DocumentEntry[])
          : fetchDocument(projectId, upToRevision),
      [projectId, upToRevision],
    ),
    [projectId, upToRevision],
  );

  if (upToRevision < 1) {
    return (
      <div className="actors">
        <div className="screen__head">
          <span className="screen__title">Actores</span>
        </div>
        <LockedByProgress
          blockedAt={blockedAt}
          what="El mapa de actores"
          onGo={onGoReview}
        />
      </div>
    );
  }

  return (
    <div className="actors">
      <AsyncBoundary resource={document}>
        {(entries) => (
          <ActorMap entries={entries} onOpenRequirement={onOpenRequirement} />
        )}
      </AsyncBoundary>
    </div>
  );
}

/** Se llama `ActorMap` y no `Map`: un componente llamado `Map` tapa el `Map`
    de JavaScript dentro del módulo, y el `new Map()` de acá abajo deja de
    compilar. */
function ActorMap({
  entries,
  onOpenRequirement,
}: {
  entries: DocumentEntry[];
  onOpenRequirement: (requirementId: string) => void;
}) {
  const actors = useMemo(() => {
    // Se agrupa sin distinguir mayúsculas y se muestra la forma en que vino
    // la primera vez: la API devuelve el texto como está escrito para no
    // romper las siglas —«especialista de la UGEL» y no «de la ugel».
    const seen = new Map<string, Actor>();
    for (const entry of entries) {
      for (const name of entry.actors ?? []) {
        const key = name.toLowerCase();
        const actor = seen.get(key) ?? { name, requirements: [] };
        actor.requirements.push(entry.requirementId);
        seen.set(key, actor);
      }
    }
    return [...seen.values()]
      .sort(
        (a, b) =>
          b.requirements.length - a.requirements.length ||
          a.name.localeCompare(b.name),
      );
  }, [entries]);

  const compuestos = entries.filter((entry) => (entry.actors ?? []).length > 1);
  const solitarios = actors.filter((actor) => actor.requirements.length === 1);
  // Nombres que empiezan igual: «especialista» y «especialista de la UGEL».
  // Es la forma que toma el vocabulario cuando se desparrama reunión a
  // reunión, y es lo único que se puede detectar sin juicio de dominio.
  const variantes = actors.filter((actor) =>
    actors.some(
      (otro) =>
        otro !== actor &&
        otro.name.toLowerCase().startsWith(`${actor.name.toLowerCase()} `),
    ),
  );

  return (
    <>
      <div className="screen__head">
        <span className="screen__title">Actores</span>
        <span className="screen__meta">
          {actors.length} actores · {entries.length} requisitos
        </span>
      </div>

      <div className="tiles">
        <div className="card">
          <span className="tile__label">Con dos actores</span>
          <div
            className={
              compuestos.length > 0 ? "tile__value tile__value--warn" : "tile__value"
            }
          >
            {compuestos.length}
            <span className="tile__of"> / {entries.length}</span>
          </div>
          <p className="tile__note">
            «Como A o B quiero X» son dos historias, o es un rol que nadie
            terminó de definir.
          </p>
        </div>
        <div className="card">
          <span className="tile__label">Con un solo requisito</span>
          <div className="tile__value">{solitarios.length}</div>
          <p className="tile__note">
            Candidatos a ser otra forma de nombrar a alguien que ya está.
          </p>
        </div>
        <div className="card">
          <span className="tile__label">Nombres que se solapan</span>
          <div className="tile__value">{variantes.length}</div>
          <p className="tile__note">
            Uno empieza igual que otro. Si son la misma persona, la
            trazabilidad de esa persona está partida en dos.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          Quién pide qué
          <span className="card__count">de más a menos requisitos</span>
        </div>
        <p className="actors__hint">
          Los actores salen del rol de cada historia. Dos nombres distintos son
          dos actores hasta que alguien decida lo contrario: la herramienta los
          pone al lado, y el arreglo va en el texto del requisito, no en un
          diccionario de alias que dejaría el documento diciendo lo que no
          quiere decir.
        </p>

        <ul className="actors__list">
          {actors.map((actor) => {
            const variante = variantes.includes(actor);
            return (
              <li key={actor.name} className="actor">
                <div className="actor__head">
                  <span className="actor__name">{actor.name}</span>
                  <span className="actor__count">
                    {actor.requirements.length}{" "}
                    {actor.requirements.length === 1 ? "requisito" : "requisitos"}
                  </span>
                  {variante && (
                    <span className="tag tag--warn">nombre solapado</span>
                  )}
                </div>
                <div className="actor__reqs">
                  {actor.requirements.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className="actor__req"
                      onClick={() => onOpenRequirement(id)}
                    >
                      {id}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {compuestos.length > 0 && (
        <div className="card">
          <div className="card__head">
            Requisitos con dos actores
            <span className="card__count">{compuestos.length}</span>
          </div>
          <ul className="actors__split">
            {compuestos.map((entry) => (
              <li key={entry.requirementId}>
                <button
                  type="button"
                  className="actor__req"
                  onClick={() => onOpenRequirement(entry.requirementId)}
                >
                  {entry.requirementId}
                </button>
                <span className="actors__roles">
                  {(entry.actors ?? []).join("  ·  ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
