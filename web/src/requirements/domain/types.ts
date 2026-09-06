/**
 * Domain types for the living requirements documentation instrument.
 *
 * These mirror the message contract between the three pipeline stages:
 * transcription -> agent -> document. Field names match the persisted
 * schema so the frontend never invents a shape the backend does not store.
 */

/** Código de voz tal como lo entrega la diarización: `S1`, `S2`… y `S?`
 *  para el habla que no pudo atribuir.
 *
 *  Es texto libre y no una unión cerrada: el conjunto lo decide el modelo al
 *  procesar cada reunión, no la aplicación. La unión anterior enumeraba los
 *  tres códigos del fixture y dejó de ser cierta al cablear la transcripción
 *  real, sin que nada lo delatara —los turnos entran por un cast de JSON. */
export type SpeakerCode = string;

/** A single speaker turn. `id` is the stable citation unit for the whole system. */
export interface Turn {
  id: number;
  meetingId: string;
  speaker: SpeakerCode;
  startsAt: string;
  text: string;
}

export type RequirementFormat = "user-story" | "ieee830" | "use-case";

export interface Requirement {
  id: string;
  content: string;
  format: RequirementFormat;
  bornInRevision: number;
}

export type ProposalOperation = "create" | "modify" | "delete" | "conflict";

/** A rule-based quality signal. Advisory only: it never blocks a decision. */
export interface QualitySignal {
  rule: string;
  label: string;
  detail: string;
}

/**
 * A proposed change to the specification.
 *
 * `sourceTurnIds` is mandatory by contract: a proposal that cannot point at
 * the transcript is discarded before it ever reaches this screen.
 */
export interface ChangeProposal {
  id: string;
  iteration: number;
  operation: ProposalOperation;
  targetId: string;
  /** Requirement text currently in force. Absent for `create`. */
  previousContent?: string;
  /** Requirement text the agent proposes. Absent for `delete`. */
  content?: string;
  sourceTurnIds: number[];
  rationale: string;
  signals: QualitySignal[];
  /**
   * Grouping used by discovery mode. Candidates are reviewed by theme so the
   * reviewer judges them against their neighbours instead of as a flat list,
   * which invites blanket approval.
   */
  theme?: string;
}

export type ReviewAction = "accept" | "edit" | "reject";

/**
 * The instrument's output.
 *
 * `presentedAt` and `decidedAt` are the study's primary measurement. They are
 * captured here and never reconstructed afterwards — an iteration reviewed
 * without them cannot be recovered.
 */
export interface ReviewDecision {
  proposalId: string;
  participantId: string;
  action: ReviewAction;
  presentedAt: number;
  decidedAt: number;
  /** Reviewer's replacement text when the action is `edit`. */
  editedContent?: string;
}

export const decisionSeconds = (d: ReviewDecision): number =>
  (d.decidedAt - d.presentedAt) / 1000;
