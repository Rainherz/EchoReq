import { useCallback, useMemo, useRef, useState } from "react";
import type { FormEvent, RefObject } from "react";
import {
  addGlossaryActor,
  fetchDocument,
  fetchGlossary,
  removeGlossaryActor,
} from "../../adapters/api/client";
import type { GlossaryActor } from "../../adapters/api/client";
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
  /** Todo lo que esta persona puede leer, sin el tope de la reunión elegida.
      «Sin usar» es una pregunta sobre el documento entero: contra la reunión
      que se está mirando, un rol que sólo aparece en la 4 saldría sin usar
      mientras mirás la 1, que es otra cosa. */
  readableRevision: number;
  blockedAt: number | null;
  onGoReview: () => void;
  onOpenRequirement: (requirementId: string) => void;
}

interface Actor {
  name: string;
  requirements: string[];
}

/** Marcas de negación: lo que viene después dice a quién NO abarca el rol.
    Buscar el actor en esa mitad daría vuelta la respuesta —«docente» aparece
    en «No incluye docentes», que es justo lo contrario de lo que se pregunta. */
const _NEGATION = /\b(no\s+incluye|no\s+excluye|no\s+aplica|excepto|salvo)\b/i;

/**
 * El rol declarado al que probablemente corresponde un actor sin definir.
 *
 * Dos vías, y las dos usan lo que ya está en pantalla. Una es de prefijo:
 * «especialista de la UGEL» y «Especialista». La otra es la definición —
 * «subdirector» está escrito adentro de «Director y subdirector de una I.E.»,
 * o sea que la respuesta ya la había dado alguien y la herramienta no la
 * leía.
 *
 * Sugiere, no decide. Que un actor se parezca a un rol declarado no lo
 * convierte en ese rol: el requisito sigue diciendo otra cosa y por eso
 * sigue marcado.
 */
function candidateFor(
  actor: string,
  glossary: GlossaryActor[],
): GlossaryActor | null {
  const name = actor.toLowerCase();

  const byPrefix = glossary.find((role) => {
    const declared = role.name.toLowerCase();
    return name.startsWith(`${declared} `) || declared.startsWith(`${name} `);
  });
  if (byPrefix) return byPrefix;

  return (
    glossary.find((role) => {
      const [included] = role.description.toLowerCase().split(_NEGATION);
      return new RegExp(`(^|[^\\p{L}])${escapeForSearch(name)}([^\\p{L}]|$)`, "u").test(
        included,
      );
    }) ?? null
  );
}

/** Un nombre de rol puede traer paréntesis o puntos, y adentro de un regex
    dejarían de ser texto para pasar a ser sintaxis. */
function escapeForSearch(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  readableRevision,
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
  const glossary = useResource(
    useCallback(() => fetchGlossary(projectId), [projectId]),
    [projectId],
  );
  const whole = useResource(
    useCallback(
      () =>
        readableRevision < 1
          ? Promise.resolve([] as DocumentEntry[])
          : fetchDocument(projectId, readableRevision),
      [projectId, readableRevision],
    ),
    [projectId, readableRevision],
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
          <ActorMap
            projectId={projectId}
            entries={entries}
            whole={whole.data ?? entries}
            glossary={glossary.data ?? []}
            onGlossaryChange={glossary.reload}
            onOpenRequirement={onOpenRequirement}
          />
        )}
      </AsyncBoundary>
    </div>
  );
}

/** Se llama `ActorMap` y no `Map`: un componente llamado `Map` tapa el `Map`
    de JavaScript dentro del módulo, y el `new Map()` de acá abajo deja de
    compilar. */
function ActorMap({
  projectId,
  entries,
  whole,
  glossary,
  onGlossaryChange,
  onOpenRequirement,
}: {
  projectId: string;
  entries: DocumentEntry[];
  /** El documento completo que esta persona puede leer. */
  whole: DocumentEntry[];
  glossary: GlossaryActor[];
  onGlossaryChange: () => void;
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

  // Definido es coincidencia exacta, sin distinguir mayúsculas. No hay
  // traducción: «especialista de la UGEL» sigue marcado hasta que alguien
  // arregle el texto de R-03 y R-07, que es donde está el problema.
  const definidos = new Set(glossary.map((a) => a.name.toLowerCase()));
  const sinDefinir = actors.filter((a) => !definidos.has(a.name.toLowerCase()));
  // Roles declarados que ningún requisito usa: o falta escribirlos, o el
  // glosario quedó con un nombre que ya nadie usa.
  const enTodoElDocumento = new Set(
    whole.flatMap((entry) => (entry.actors ?? []).map((a) => a.toLowerCase())),
  );
  const sinUsar = glossary.filter(
    (a) => !enTodoElDocumento.has(a.name.toLowerCase()),
  );

  // El nombre del formulario vive acá arriba para que cada fila sin definir
  // pueda prellenarlo con su nombre exacto. Retipear quince roles que ya
  // están en pantalla es quince chances de escribir uno distinto, que es el
  // problema que el glosario vino a cerrar.
  const [draftName, setDraftName] = useState("");
  const descriptionRef = useRef<HTMLInputElement>(null);
  const declare = (name: string) => {
    setDraftName(name);
    // El nombre ya viene puesto: lo que falta escribir es quién es.
    descriptionRef.current?.focus();
  };

  const conCandidato = sinDefinir.filter(
    (actor) => candidateFor(actor.name, glossary) !== null,
  ).length;

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
        <div className="card">
          <span className="tile__label">Sin definir</span>
          <div
            className={
              glossary.length > 0 && sinDefinir.length > 0
                ? "tile__value tile__value--warn"
                : "tile__value"
            }
          >
            {glossary.length === 0 ? "—" : sinDefinir.length}
            {glossary.length > 0 && (
              <span className="tile__of"> / {actors.length}</span>
            )}
          </div>
          <p className="tile__note">
            {glossary.length === 0
              ? "Sin glosario no hay contra qué comparar. Declará los roles abajo."
              : conCandidato > 0
                ? `${conCandidato} se parecen a un rol que ya declaraste. El resto hay que decidirlo.`
                : "Aparecen en un requisito y no están declarados."}
          </p>
        </div>
      </div>

      <Glossary
        projectId={projectId}
        actors={glossary}
        unused={sinUsar}
        name={draftName}
        onName={setDraftName}
        descriptionRef={descriptionRef}
        onChange={onGlossaryChange}
      />

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
                  {!definidos.has(actor.name.toLowerCase()) && (
                    <>
                      {glossary.length > 0 &&
                        (candidateFor(actor.name, glossary) ? (
                          <span className="tag tag--hint">
                            parece {candidateFor(actor.name, glossary)?.name}
                          </span>
                        ) : (
                          <span className="tag">sin definir</span>
                        ))}
                      <button
                        type="button"
                        className="actor__declare"
                        onClick={() => declare(actor.name)}
                      >
                        declarar
                      </button>
                    </>
                  )}
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

/**
 * Los roles que el proyecto reconoce.
 *
 * Declara quién existe; no reescribe quién pidió. Un actor que aparece en un
 * requisito y no figura acá queda marcado, y sigue marcado hasta que alguien
 * arregle el texto del requisito —que es donde está el problema. Una tabla de
 * alias que tradujera «especialista de la UGEL» a «especialista» dejaría el
 * documento diciendo lo que no quiere decir, prolijo por fuera.
 *
 * Es configuración, no dato del estudio: se corrige y se borra. El log de
 * requisitos y las decisiones, que sí son el dato, llevan un trigger que
 * rechaza UPDATE y DELETE.
 */
function Glossary({
  projectId,
  actors,
  unused,
  name,
  onName,
  descriptionRef,
  onChange,
}: {
  projectId: string;
  actors: GlossaryActor[];
  /** Declarados que ningún requisito usa, en todo el documento. */
  unused: GlossaryActor[];
  /** Controlado desde afuera: cada fila sin definir lo prellena. */
  name: string;
  onName: (name: string) => void;
  descriptionRef: RefObject<HTMLInputElement | null>;
  onChange: () => void;
}) {
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const sinUsar = new Set(unused.map((a) => a.name.toLowerCase()));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) return;
    setSaving(true);
    setFailure(null);
    try {
      await addGlossaryActor(projectId, name.trim(), description.trim());
      onName("");
      setDescription("");
      onChange();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (actorName: string) => {
    setFailure(null);
    try {
      await removeGlossaryActor(projectId, actorName);
      onChange();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div className="card">
      <div className="card__head">
        Glosario de roles
        <span className="card__count">
          {actors.length} {actors.length === 1 ? "declarado" : "declarados"}
        </span>
      </div>

      <p className="actors__hint">
        Los roles que este proyecto reconoce. Sirven de referencia, no de
        traducción: declarar «especialista» no convierte a «especialista de la
        UGEL» en ese rol, lo deja marcado hasta que se arregle el texto del
        requisito.
      </p>

      {actors.length > 0 && (
        <ul className="glossary">
          {actors.map((actor) => (
            <li key={actor.name} className="glossary__item">
              <span className="glossary__name">{actor.name}</span>
              {sinUsar.has(actor.name.toLowerCase()) && (
                <span className="tag">sin usar</span>
              )}
              {actor.description && (
                <span className="glossary__desc">{actor.description}</span>
              )}
              <button
                type="button"
                className="glossary__drop"
                aria-label={`Sacar ${actor.name} del glosario`}
                onClick={() => remove(actor.name)}
              >
                sacar
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="glossary__form" onSubmit={submit}>
        <label className="glossary__field">
          <span className="label">Rol</span>
          <input
            className="field"
            type="text"
            maxLength={60}
            value={name}
            placeholder="directivo"
            onChange={(event) => onName(event.target.value)}
          />
        </label>
        <label className="glossary__field glossary__field--wide">
          {/* No «qué hace»: eso ya lo dice la lista de arriba, y repetirlo acá
              daría dos fuentes que se desincronizan en cuanto entre un
              requisito nuevo. La pregunta que el glosario tiene que contestar
              es de límite —¿«subdirector» entra en «directivo» o es otro
              rol?—, que es la que convierte quince actores en seis. */}
          <span className="label">A quién incluye</span>
          <input
            className="field"
            type="text"
            ref={descriptionRef}
            maxLength={280}
            value={description}
            placeholder="Director y subdirector de una IE. No incluye al jefe de gestión."
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className="btn btn--small btn--primary"
          disabled={saving || name.trim().length < 2}
        >
          {saving ? "Guardando…" : "Declarar"}
        </button>
      </form>

      {failure && (
        <p className="resolve__error" role="alert">
          {failure}
        </p>
      )}
    </div>
  );
}
