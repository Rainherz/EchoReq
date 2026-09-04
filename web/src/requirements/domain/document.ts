import type { ProposalOperation, RequirementFormat } from "./types";

/**
 * One immutable entry in the requirement history.
 *
 * The document is never updated in place: each iteration appends new rows and
 * the current specification is derived by taking the latest row per
 * requirement. This is what makes the drift analysis a query rather than a
 * reconstruction.
 */
export interface RequirementRevision {
  requirementId: string;
  /** Document revision this row belongs to. One revision per meeting. */
  revision: number;
  meetingId: string;
  operation: ProposalOperation;
  content: string;
  sourceTurnIds: number[];
  /** Short reviewer-facing description of what this entry changed. */
  summary: string;
}

export interface DocumentEntry {
  requirementId: string;
  content: string;
  format: RequirementFormat;
  bornInRevision: number;
  lastRevision: number;
  changeCount: number;
  responsibilities: number;
}

const byRevision = (a: RequirementRevision, b: RequirementRevision) =>
  a.revision - b.revision;

/** Full append-only history of one requirement, oldest first. */
export function historyOf(
  log: RequirementRevision[],
  requirementId: string,
): RequirementRevision[] {
  return log
    .filter((row) => row.requirementId === requirementId)
    .sort(byRevision);
}

/**
 * Derive the specification as it stands at `upTo`.
 *
 * Deleted requirements drop out; everything else takes its most recent
 * content at or before that revision.
 */
export function documentAt(
  log: RequirementRevision[],
  upTo: number,
  format: RequirementFormat = "user-story",
): DocumentEntry[] {
  const ids = [...new Set(log.map((row) => row.requirementId))];

  return ids
    .map((id) => {
      const history = historyOf(log, id).filter((row) => row.revision <= upTo);
      const latest = history.at(-1);
      if (!latest || latest.operation === "delete") return null;

      return {
        requirementId: id,
        content: latest.content,
        format,
        bornInRevision: history[0].revision,
        lastRevision: latest.revision,
        changeCount: history.length - 1,
        responsibilities: estimateResponsibilities(latest.content),
      } satisfies DocumentEntry;
    })
    .filter((entry): entry is DocumentEntry => entry !== null)
    .sort((a, b) => a.requirementId.localeCompare(b.requirementId));
}

/**
 * Rough count of distinct obligations packed into one requirement.
 *
 * Heuristic placeholder for the rule engine: sentences, plus the subordinate
 * markers Spanish requirement text uses to bolt extra behaviour onto an
 * existing story. Good enough to surface the atomicity drift the study
 * tracks; the real QUS rule set replaces it.
 */
export function estimateResponsibilities(text: string): number {
  const sentences = text
    .split(/(?<=\.)\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0).length;

  const clauseMarkers = [
    /,\s*excepto\b/gi,
    /,\s*en cuyo caso\b/gi,
    /,\s*salvo\b/gi,
    /\sy debe\b/gi,
    /,\s*distinguiendo\b/gi,
  ];

  const extra = clauseMarkers.reduce(
    (total, marker) => total + (text.match(marker)?.length ?? 0),
    0,
  );

  return sentences + extra;
}

/** Requirements touched in a given revision, with the operation applied. */
export function touchedIn(
  log: RequirementRevision[],
  revision: number,
): RequirementRevision[] {
  return log.filter((row) => row.revision === revision);
}
