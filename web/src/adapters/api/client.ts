/**
 * Cliente HTTP del instrumento.
 *
 * Una sola capa de acceso: ningún componente hace fetch por su cuenta. Las
 * rutas van por `/api`, que Vite redirige al backend en desarrollo.
 */

import type {
  ChangeProposal,
  QualitySignal,
  ProposalOperation,
  ReviewAction,
  Turn,
} from "../../requirements/domain/types";
import type {
  DocumentEntry,
  Rejection,
  RequirementRevision,
} from "../../requirements/domain/document";

const BASE = "/api";

export class ApiError extends Error {
  // Campo declarado y asignado por separado: `erasableSyntaxOnly` no admite
  // propiedades de parámetro en el constructor.
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Texto legible de un `detail` de la API.
 *
 * Los errores propios llegan como una oración, pero los de validación de
 * FastAPI llegan como una lista de objetos. Tratarlos a todos como texto los
 * mostraba en pantalla como "[object Object]", que no le dice nada a quien
 * tiene que corregir el formulario.
 */
function describe(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        const field = Array.isArray(item?.loc) ? item.loc.at(-1) : null;
        return field ? `${field}: ${item.msg}` : String(item?.msg ?? item);
      })
      .join(" · ");
  }
  return JSON.stringify(detail);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    const detail = await response
      .json()
      .then((body) => describe(body.detail))
      .catch(() => response.statusText);
    throw new ApiError(response.status, detail);
  }

  return response.json() as Promise<T>;
}

/* ------------------------------------------------------------------ tipos */

/** Propuesta más la ventana de transcripción que la respalda. */
export interface QueueItem extends ChangeProposal {
  contextTurns: Turn[];
}

interface RawQueueItem {
  id: string;
  iteration: number;
  operation: ProposalOperation;
  targetId: string;
  content: string | null;
  previousContent: string | null;
  sourceTurnIds: number[];
  rationale: string;
  signals: QualitySignal[];
  theme: string | null;
  contextTurns: Array<{
    id: number;
    meetingId: string;
    speaker: string;
    startsAt: string;
    text: string;
  }>;
}

export interface IterationMetrics {
  iteration: number;
  decisions: number;
  medianSeconds: number;
  /** `discovery` o `living`. La latencia solo se compara entre iteraciones
      del mismo modo. */
  mode: "discovery" | "living";
  acceptedWithoutEdit: number;
  defectiveAccepted: number;
  defectiveTotal: number;
}

export interface DriftPoint {
  revision: number;
  requirements: number;
  overAtomicLimit: number;
  meanResponsibilities: number;
  maxResponsibilities: number;
}

interface RawRevision {
  requirementId: string;
  revision: number;
  meetingId: string;
  operation: ProposalOperation;
  content: string;
  sourceTurnIds: number[];
  summary: string;
}

export interface Participant {
  id: string;
  displayName: string;
  role: string;
  /** Decisiones ya registradas, en todos los proyectos. */
  decisions: number;
  createdAt?: string | null;
}

export interface NewParticipant {
  displayName: string;
  role: string;
}

/** Quiénes pueden revisar. La lista es del instrumento, no de un proyecto. */
export const fetchParticipants = (): Promise<Participant[]> =>
  request<Participant[]>("/participants");

export const createParticipant = (input: NewParticipant): Promise<Participant> =>
  request<Participant>("/participants", {
    method: "POST",
    body: JSON.stringify(input),
  });

export interface Meeting {
  id: string;
  iteration: number;
  label: string;
  mode: "discovery" | "living";
  heldAt: string;
  hasConsent: boolean;
  turnCount: number;
  /** Propuestas que este participante todavía no decidió. */
  pendingProposals: number;
  /** Total que produjo la generación, decididas o no. */
  proposalCount: number;
  audioFilename: string | null;
  audioBytes: number | null;
  transcriptionStatus: "pending" | "running" | "done" | "failed";
  transcriptionError: string | null;
}

/**
 * Sube el audio de una reunión.
 *
 * Va como multipart y sin `Content-Type` propio: el navegador tiene que
 * poner el suyo con el `boundary`, y fijarlo a mano rompe el parseo.
 */
export async function uploadAudio(
  meetingId: string,
  file: File,
): Promise<{ filename: string; sizeBytes: number; sha256: string }> {
  const body = new FormData();
  body.append("file", file);

  const response = await fetch(
    `${BASE}/meetings/${encodeURIComponent(meetingId)}/audio`,
    { method: "POST", body },
  );

  if (!response.ok) {
    const detail = await response
      .json()
      .then((payload) => payload.detail as string)
      .catch(() => response.statusText);
    throw new ApiError(response.status, detail);
  }

  return response.json();
}

export async function recordConsent(meetingId: string): Promise<void> {
  const response = await fetch(
    `${BASE}/meetings/${encodeURIComponent(meetingId)}/consent`,
    { method: "POST" },
  );
  if (!response.ok) {
    throw new ApiError(response.status, "No se pudo registrar el consentimiento.");
  }
}

export interface NewMeeting {
  label: string;
  /** ISO 8601. */
  heldAt: string;
  participantId: string;
}

/**
 * Crea la próxima reunión del proyecto.
 *
 * La iteración y el modo no se mandan: los deriva el servidor, porque son
 * reglas del estudio y no opciones de quien la crea.
 */
export function createMeeting(
  projectId: string,
  input: NewMeeting,
): Promise<Meeting> {
  return request<Meeting>(`/projects/${projectId}/meetings`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface Project {
  id: string;
  name: string;
  format: string;
  /** Qué sistema se especifica. Entra en el prompt de generación. */
  domain: string;
  meetingCount: number;
  createdAt: string | null;
}

export interface NewProject {
  name: string;
  format: string;
  domain: string;
}

export function createProject(input: NewProject): Promise<Project> {
  return request<Project>("/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/* --------------------------------------------------------------- lecturas */

export function fetchProjects(): Promise<Project[]> {
  return request<Project[]>("/projects");
}

export function fetchMeetings(
  projectId: string,
  participantId: string,
): Promise<Meeting[]> {
  return request<Meeting[]>(
    `/projects/${projectId}/meetings?participant=${encodeURIComponent(participantId)}`,
  );
}


export async function fetchQueue(
  projectId: string,
  iteration: number,
  participantId: string,
): Promise<QueueItem[]> {
  const raw = await request<RawQueueItem[]>(
    `/projects/${projectId}/iterations/${iteration}/queue?participant=${encodeURIComponent(participantId)}`,
  );

  return raw.map((item) => ({
    id: item.id,
    iteration: item.iteration,
    operation: item.operation,
    targetId: item.targetId,
    content: item.content ?? undefined,
    previousContent: item.previousContent ?? undefined,
    sourceTurnIds: item.sourceTurnIds,
    rationale: item.rationale,
    signals: item.signals,
    theme: item.theme ?? undefined,
    contextTurns: item.contextTurns.map((turn) => ({
      id: turn.id,
      meetingId: turn.meetingId,
      speaker: turn.speaker as Turn["speaker"],
      startsAt: turn.startsAt,
      text: turn.text,
    })),
  }));
}

export async function fetchTurns(meetingId: string): Promise<Turn[]> {
  const raw = await request<
    Array<{
      id: number;
      meetingId: string;
      speaker: string;
      startsAt: string;
      text: string;
    }>
  >(`/meetings/${encodeURIComponent(meetingId)}/turns`);

  return raw.map((turn) => ({
    id: turn.id,
    meetingId: turn.meetingId,
    speaker: turn.speaker as Turn["speaker"],
    startsAt: turn.startsAt,
    text: turn.text,
  }));
}

export function fetchDocument(
  projectId: string,
  revision: number,
): Promise<DocumentEntry[]> {
  return request<DocumentEntry[]>(
    `/projects/${projectId}/document?revision=${revision}`,
  );
}

/**
 * La especificación en cada revisión hasta `upTo`.
 *
 * La matriz de trazabilidad necesita la evolución de responsabilidades por
 * requisito, y esos números tienen que salir del backend para no divergir de
 * los que usa el análisis.
 */
export function fetchDocumentSnapshots(
  projectId: string,
  upTo: number,
): Promise<DocumentEntry[][]> {
  return Promise.all(
    Array.from({ length: upTo }, (_, i) => fetchDocument(projectId, i + 1)),
  );
}

export function fetchRejections(projectId: string): Promise<Rejection[]> {
  return request<Rejection[]>(`/projects/${projectId}/rejections`);
}

export async function fetchRevisions(
  projectId: string,
): Promise<RequirementRevision[]> {
  const raw = await request<RawRevision[]>(`/projects/${projectId}/revisions`);
  return raw.map((row) => ({
    requirementId: row.requirementId,
    revision: row.revision,
    meetingId: row.meetingId,
    operation: row.operation,
    content: row.content,
    sourceTurnIds: row.sourceTurnIds,
    summary: row.summary,
  }));
}

export interface DatasetColumn {
  name: string;
  meaning: string;
}

export interface Dataset {
  name: string;
  title: string;
  purpose: string;
  columns: DatasetColumn[];
  rows: number;
}

export function fetchDatasets(projectId: string): Promise<Dataset[]> {
  return request<Dataset[]>(`/projects/${projectId}/export`);
}

/**
 * URL de descarga de un conjunto.
 *
 * Se navega como enlace en vez de bajarse por fetch: el servidor manda
 * Content-Disposition y el navegador guarda el archivo sin que la aplicación
 * tenga que armar un blob.
 */
export function csvUrl(projectId: string, name: string): string {
  return `${BASE}/projects/${projectId}/export/${name}.csv`;
}

export function fetchMetrics(projectId: string): Promise<IterationMetrics[]> {
  return request<IterationMetrics[]>(`/projects/${projectId}/metrics`);
}

export function fetchDrift(projectId: string): Promise<DriftPoint[]> {
  return request<DriftPoint[]>(`/projects/${projectId}/drift`);
}

/* --------------------------------------------------------------- escritura */

export interface RecordDecisionInput {
  proposalId: string;
  participantId: string;
  action: ReviewAction;
  /** Momento en que la propuesta apareció en pantalla, medido por el cliente. */
  presentedAt: number;
  decidedAt: number;
  editedContent?: string;
}

/**
 * Anexa una decisión de revisión.
 *
 * Los instantes viajan tal como los midió la interfaz. El servidor no los
 * infiere de la hora de llegada: eso mediría la latencia de red en lugar de
 * la atención del revisor.
 */
export interface CorrectionInput {
  decisionId: number;
  participantId: string;
  /** Qué había querido hacer en realidad. */
  intendedAction: ReviewAction;
  reason: string;
}

/**
 * Marca una decisión como error de registro.
 *
 * No borra ni modifica la original: queda en los datos, señalada. El motivo
 * es obligatorio y una decisión se corrige una sola vez, para que corregir no
 * funcione como un deshacer —si corregir fuera gratis, el revisor decidiría
 * más rápido sabiendo que puede volver atrás, y eso también contamina la
 * medición.
 */
export function correctDecision(
  input: CorrectionInput,
): Promise<{ id: number }> {
  return request<{ id: number }>("/decision-corrections", {
    method: "POST",
    body: JSON.stringify({
      decisionId: input.decisionId,
      participantId: input.participantId,
      intendedAction: input.intendedAction,
      reason: input.reason,
    }),
  });
}

export function recordDecision(
  input: RecordDecisionInput,
): Promise<{ id: number; seconds: number }> {
  return request<{ id: number; seconds: number }>("/review-decisions", {
    method: "POST",
    body: JSON.stringify({
      proposalId: input.proposalId,
      participantId: input.participantId,
      action: input.action,
      presentedAt: new Date(input.presentedAt).toISOString(),
      decidedAt: new Date(input.decidedAt).toISOString(),
      editedContent: input.editedContent ?? null,
    }),
  });
}
