import type { ActorDecision, GlossaryActor } from "../../../adapters/api/client";
import type { DocumentEntry } from "../../domain/document";

export interface ActorRow {
  /** El nombre tal como está escrito en los requisitos. */
  name: string;
  requirements: string[];
  /** Coincide exactamente con un rol declarado. No hay nada que decidir. */
  declared: boolean;
  decision: ActorDecision | null;
  /** El rol declarado al que probablemente corresponde, si no coincide. */
  candidate: GlossaryActor | null;
}

/** Marcas de negación: lo que viene después dice a quién NO abarca el rol.
    Buscar el actor en esa mitad daría vuelta la respuesta —«docente» aparece
    en «No incluye docentes», que es justo lo contrario de lo que se pregunta. */
const NEGATION = /\b(no\s+incluye|no\s+excluye|no\s+aplica|excepto|salvo)\b/i;

/** Un nombre de rol puede traer paréntesis o puntos, y adentro de un regex
    dejarían de ser texto para pasar a ser sintaxis. */
function escapeForSearch(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * El rol declarado al que probablemente corresponde un nombre sin decidir.
 *
 * Dos vías, y las dos usan lo que ya está escrito. Una es de prefijo:
 * «especialista de la UGEL» contra «Especialista». La otra es la definición —
 * «subdirector» está adentro de «Director y subdirector de una I.E.», o sea
 * que alguien ya había contestado y nadie lo leía.
 *
 * Sugiere, no decide.
 */
export function candidateFor(
  actor: string,
  glossary: GlossaryActor[],
): GlossaryActor | null {
  const name = actor.toLowerCase();

  const byPrefix = glossary.find((role) => {
    const declared = role.name.toLowerCase();
    return name.startsWith(`${declared} `) || declared.startsWith(`${name} `);
  });
  if (byPrefix) return byPrefix;

  const pattern = new RegExp(
    `(^|[^\\p{L}])${escapeForSearch(name)}([^\\p{L}]|$)`,
    "u",
  );
  return (
    glossary.find((role) =>
      pattern.test(role.description.toLowerCase().split(NEGATION)[0]),
    ) ?? null
  );
}

/** Los nombres de actor del documento, con lo que se sabe de cada uno. */
export function actorRows(
  entries: DocumentEntry[],
  glossary: GlossaryActor[],
  decisions: ActorDecision[],
): ActorRow[] {
  const declared = new Set(glossary.map((role) => role.name.toLowerCase()));
  const decided = new Map(
    decisions.map((decision) => [decision.observed.toLowerCase(), decision]),
  );

  // Se agrupa sin distinguir mayúsculas y se muestra la forma en que vino la
  // primera vez: la API devuelve el texto como está escrito para no romper
  // las siglas.
  const seen = new Map<string, { name: string; requirements: string[] }>();
  for (const entry of entries) {
    for (const name of entry.actors ?? []) {
      const key = name.toLowerCase();
      const row = seen.get(key) ?? { name, requirements: [] };
      row.requirements.push(entry.requirementId);
      seen.set(key, row);
    }
  }

  return [...seen.entries()]
    .map(([key, row]): ActorRow => ({
      name: row.name,
      requirements: row.requirements,
      declared: declared.has(key),
      decision: decided.get(key) ?? null,
      candidate: declared.has(key) ? null : candidateFor(row.name, glossary),
    }))
    .sort(
      (a, b) =>
        b.requirements.length - a.requirements.length ||
        a.name.localeCompare(b.name),
    );
}

/** Falta decidir qué representa: ni coincide con un rol declarado ni hay una
    decisión anotada. */
export function isPending(row: ActorRow): boolean {
  return !row.declared && row.decision === null;
}

export interface Todo {
  requirementId: string;
  observed: string;
  /** Lo que debería decir. Puede faltar si se marcó como error sin resolver
      todavía a quién corresponde. */
  shouldSay: string | null;
  outcome: string;
}

/**
 * Lo que queda por aplicar.
 *
 * Es el producto de la pantalla. Decidir no cambia el documento —el log es
 * inmutable y las revisiones ya medidas no se reescriben—, así que cada
 * decisión deja esto, que se aplica al decidir propuestas de una reunión
 * futura. Un rol nuevo no deja pendiente: se declara y el nombre pasa a
 * coincidir.
 */
export function todosFrom(rows: ActorRow[]): Todo[] {
  return rows
    .filter((row) => row.decision !== null && row.decision.outcome !== "new")
    .flatMap((row) =>
      row.requirements.map((requirementId) => ({
        requirementId,
        observed: row.name,
        shouldSay: row.decision?.role ?? null,
        outcome: row.decision?.outcome ?? "",
      })),
    )
    .sort((a, b) => a.requirementId.localeCompare(b.requirementId));
}

export interface Pattern {
  pair: [string, string];
  requirements: string[];
}

/**
 * Pares de actores que aparecen juntos una y otra vez.
 *
 * «Como especialista o directivo quiero X» cinco veces no son cinco
 * descuidos: es un rol real que nadie nombró. Con dos apariciones todavía
 * puede ser casualidad, así que el corte es en tres.
 */
export function recurringPairs(entries: DocumentEntry[]): Pattern[] {
  const pairs = new Map<string, Pattern>();
  for (const entry of entries) {
    const actors = entry.actors ?? [];
    if (actors.length !== 2) continue;
    // Ordenado: «A o B» y «B o A» son el mismo par escrito al revés.
    const [first, second] = [...actors].sort((a, b) => a.localeCompare(b));
    const key = `${first.toLowerCase()}|${second.toLowerCase()}`;
    const found = pairs.get(key) ?? { pair: [first, second], requirements: [] };
    found.requirements.push(entry.requirementId);
    pairs.set(key, found);
  }
  return [...pairs.values()]
    .filter((pattern) => pattern.requirements.length >= 3)
    .sort((a, b) => b.requirements.length - a.requirements.length);
}
