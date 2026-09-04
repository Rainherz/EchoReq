import type { ProposalOperation } from "./types";

/**
 * Una entrada inmutable de la historia de un requisito.
 *
 * El documento no se guarda mutado: cada iteración anexa filas nuevas y la
 * especificación vigente se deriva tomando la última fila de cada requisito.
 *
 * Esa derivación vive en el backend y no se replica acá. Tener dos
 * implementaciones de la misma regla es pedir que se desincronicen, y la que
 * lee el análisis es la del backend.
 */
export interface RequirementRevision {
  requirementId: string;
  revision: number;
  meetingId: string;
  operation: ProposalOperation;
  content: string;
  sourceTurnIds: number[];
  summary: string;
}

/** Un requisito tal como queda en una revisión dada. Lo calcula la API. */
export interface DocumentEntry {
  requirementId: string;
  content: string;
  bornInRevision: number;
  lastRevision: number;
  changeCount: number;
  responsibilities: number;
}

/** Propuesta rechazada: no dejó texto, pero la ausencia es un dato. */
export interface Rejection {
  proposalId: string;
  iteration: number;
  targetId: string;
  operation: ProposalOperation;
  rationale: string;
}
