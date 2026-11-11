/**
 * Marca corta de un hablante, para el círculo que lo identifica.
 *
 * La diarización devuelve códigos de dos o tres caracteres (`S1`, `S2`), que
 * entran en el círculo. Una transcripción importada trae el nombre tal como
 * figura en el archivo (`Analista`, `Director`), y escrito entero se desborda
 * sobre el texto de al lado. Ahí el círculo muestra dos letras y el nombre
 * completo va en el texto del turno.
 */
export function speakerMark(code: string): string {
  if (code.length <= 3) return code;
  const words = code.split(/\s+/).filter((word) => word.length > 0);
  if (words.length >= 2) {
    return words
      .slice(0, 2)
      .map((word) => word[0].toUpperCase())
      .join("");
  }
  return code.slice(0, 2).toUpperCase();
}

/** El código ya es un nombre legible y no hace falta etiquetarlo. */
export function isNamedSpeaker(code: string): boolean {
  return code.length > 3;
}
