import type { AgreementRow, Participant } from "../../../adapters/api/client";

export interface VersionGroup {
  /** El texto en sí: es lo que identifica al grupo. */
  text: string;
  /** Quiénes lo dejaron, en el orden en que figuran los participantes. */
  authors: Participant[];
}

/**
 * Agrupa las versiones por texto y no por persona.
 *
 * Una lista por revisor dibuja un párrafo por cabeza: dos revisores que
 * coinciden en la redacción producen dos bloques idénticos con dos botones
 * que hacen lo mismo, y cinco revisores producen cinco. La cantidad de
 * redacciones distintas, en cambio, casi nunca pasa de dos o tres por más
 * gente que revise. Ese es el eje que no crece con el equipo.
 */
export function groupByText(
  participants: Participant[],
  texts: Record<string, string>,
): VersionGroup[] {
  const groups: VersionGroup[] = [];
  for (const person of participants) {
    const text = texts[person.id];
    if (text === undefined) continue;
    const existing = groups.find((group) => group.text === text);
    if (existing) existing.authors.push(person);
    else groups.push({ text, authors: [person] });
  }
  // La mayoría primero: es la que sirve de referencia para comparar.
  return groups.sort((a, b) => b.authors.length - a.authors.length);
}

/** «Ana», «Ana y Beto», «Ana, Beto y Carla». */
export function namesOf(authors: Participant[]): string {
  const names = authors.map((author) => author.displayName);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

/** Iniciales para la marca de autor. Dos como mucho: con tres deja de
    leerse como una persona y empieza a leerse como una sigla. */
export function initialsOf(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

/**
 * Qué fue lo que no coincidió.
 *
 * Son tres cosas distintas y una sola etiqueta las confundía: una fila podía
 * decir «difieren» y, al abrirla, mostrar el mismo texto dos veces —los
 * revisores habían discrepado en la acción, no en la redacción— sin nada que
 * explicara la contradicción.
 */
export function disagreement(row: AgreementRow): string | null {
  if (row.disputed && row.textDiffers) return "difieren";
  if (row.disputed) return "distinta acción";
  if (row.textDiffers) return "distinto texto";
  return null;
}

/** Pide resolución: los revisores no coincidieron y nadie lo saldó todavía. */
export function needsAttention(row: AgreementRow): boolean {
  return row.outcome === null && disagreement(row) !== null;
}
