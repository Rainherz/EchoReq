/**
 * Minimal prefix/suffix diff.
 *
 * Specification drift shows up overwhelmingly as appended or spliced clauses,
 * so a common-prefix / common-suffix comparison marks the real change without
 * pulling in a diffing library. Word-aligned so the boundaries never land
 * mid-word.
 */

export interface DiffSegment {
  text: string;
  kind: "same" | "removed" | "added";
}

/**
 * Split into words, whitespace and punctuation as separate tokens.
 *
 * Punctuation has to stand alone or a trailing comma makes an untouched word
 * read as removed-and-re-added: "día" vs "día," would not match.
 */
const words = (s: string): string[] =>
  s.split(/(\s+|[.,;:()¿?¡!"—–-])/).filter((w) => w !== "" && w !== undefined);

export function diffSegments(before: string, after: string): {
  removed: DiffSegment[];
  added: DiffSegment[];
} {
  const a = words(before);
  const b = words(after);

  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;

  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail++;
  }

  const build = (tokens: string[], changed: "removed" | "added"): DiffSegment[] => {
    const prefix = tokens.slice(0, head).join("");
    const middle = tokens.slice(head, tokens.length - tail).join("");
    const suffix = tokens.slice(tokens.length - tail).join("");
    const out: DiffSegment[] = [];
    if (prefix) out.push({ text: prefix, kind: "same" });
    if (middle) out.push({ text: middle, kind: changed });
    if (suffix) out.push({ text: suffix, kind: "same" });
    return out;
  };

  return { removed: build(a, "removed"), added: build(b, "added") };
}
