/**
 * Diferencia por palabra entre dos redacciones.
 *
 * Sin esto la pantalla afirma un desacuerdo que nunca muestra: dos versiones
 * que difieren en una sola cláusula obligan a leer los dos párrafos enteros,
 * palabra por palabra, para encontrar dónde está.
 *
 * Es la subsecuencia común más larga de toda la vida, sobre palabras en vez
 * de caracteres. A la escala de un requisito —decenas de palabras— la tabla
 * cuadrática es irrelevante, y evita traer una dependencia por sesenta
 * líneas.
 */

export type DiffKind = "same" | "added" | "removed";

export interface DiffPart {
  kind: DiffKind;
  text: string;
}

export interface Diff {
  /** El texto de la versión, con lo que agregó y lo que quitó marcado. */
  parts: DiffPart[];
  /** Tramos que cambian, no palabras sueltas: «durante 30 minutos» es un
      cambio, no tres. Contarlos por palabra infla el número y le quita el
      sentido a «una diferencia». */
  changes: number;
}

/** Corta en palabras dejando pegado el espacio que sigue, para que volver a
    unir los tramos devuelva el texto original sin inventar separadores. */
function tokenize(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

/** Agrega al final fundiendo con el tramo anterior si es del mismo tipo. Sin
    esto cada palabra sería su propio tramo y `changes` contaría palabras. */
function append(parts: DiffPart[], kind: DiffKind, text: string): void {
  const last = parts[parts.length - 1];
  if (last !== undefined && last.kind === kind) last.text += text;
  else parts.push({ kind, text });
}

/**
 * Compara `version` contra `baseline` y devuelve un solo flujo de tramos.
 *
 * Uno solo y no dos columnas espejadas: con tres o más versiones, mostrar
 * cada par lado a lado repetiría la referencia una vez por comparación. Así
 * el texto de cada versión aparece exactamente una vez, anotado.
 */
export function diffAgainst(baseline: string, version: string): Diff {
  const a = tokenize(baseline);
  const b = tokenize(version);

  // table[i][j] = largo de la subsecuencia común desde a[i] y b[j].
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] =
        a[i].trim() === b[j].trim()
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i].trim() === b[j].trim()) {
      append(parts, "same", b[j]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      append(parts, "removed", a[i]);
      i++;
    } else {
      append(parts, "added", b[j]);
      j++;
    }
  }
  while (i < a.length) append(parts, "removed", a[i++]);
  while (j < b.length) append(parts, "added", b[j++]);

  return {
    parts,
    changes: parts.filter((part) => part.kind !== "same").length,
  };
}
