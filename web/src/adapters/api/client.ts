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

  // Las respuestas sin cuerpo —204 de un alta de consentimiento o de una
  // etiqueta— no se pueden parsear como JSON.
  if (response.status === 204) return undefined as T;

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
  /** Sembradas aceptadas tal cual. Lectura literal. */
  defectiveAccepted: number;
  /** Sembradas que el revisor no advirtió, según qué acción corrige cada tipo
      de defecto. Es la que responde H1. */
  defectiveUndetected: number;
  defectiveTotal: number;
}

export interface DriftPoint {
  revision: number;
  requirements: number;
  /** Cuánto se hincha un requisito: indicador derivado de la propiedad
      «atomic» de SWEBOK v4 §3.1, por el mecanismo que autoriza §7.5. */
  overAtomicLimit: number;
  meanResponsibilities: number;
  maxResponsibilities: number;
  /** Requisitos ya existentes que esta revisión volvió a tocar. */
  reopened: number;
  /** Cuánto se mueve el documento: `reopened` sobre el vigente, en
      porcentaje. Es el otro eje de deriva —SWEBOK v4 §7.4 volatility— y no
      el mismo que la atomicidad. */
  volatility: number;
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

export interface SpeakerSample {
  turnId: number;
  startsAt: string;
  endsAt: string | null;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface Suggestion {
  role: string;
  name: string | null;
  /** Similitud coseno contra la voz conocida, entre 0 y 1. */
  similarity: number;
  fromMeeting: string;
}

export interface Speaker {
  code: string;
  /** Qué es esta voz en la reunión. Va al prompt y a las exportaciones. */
  role: string | null;
  /** Quién es. Para que el analista sepa a quién escuchó; no sale de la base. */
  name: string | null;
  turns: number;
  characters: number;
  samples: SpeakerSample[];
  /** A qué voz conocida se parece. Se propone; la confirma una persona. */
  suggestion: Suggestion | null;
}

export const fetchSpeakers = (meetingId: string): Promise<Speaker[]> =>
  request<Speaker[]>(`/meetings/${encodeURIComponent(meetingId)}/speakers`);

export async function labelSpeaker(
  meetingId: string,
  code: string,
  role: string,
  name?: string,
): Promise<void> {
  await request<void>(
    `/meetings/${encodeURIComponent(meetingId)}/speakers/${encodeURIComponent(code)}`,
    { method: "PUT", body: JSON.stringify({ role, name: name || null }) },
  );
}

/** URL de un recorte del audio. El servidor lo corta; acá solo se reproduce. */
export function clipUrl(
  meetingId: string,
  startSeconds: number,
  seconds: number,
): string {
  const dur = Math.min(Math.max(seconds, 1), 45);
  return `/api/meetings/${encodeURIComponent(meetingId)}/audio/clip?start=${startSeconds}&seconds=${dur}`;
}

export interface Participant {
  id: string;
  displayName: string;
  role: string;
  /** Arbitra los desacuerdos: es quien ve y usa Concordancia. Sale de una
      columna propia y no de `role`, que es texto descriptivo que alguien
      tipea —conviven «analista» y «Analista» en la misma base. */
  isLead: boolean;
  /** Decisiones ya registradas, en todos los proyectos. */
  decisions: number;
  createdAt?: string | null;
}

/** Un rol que el proyecto reconoce. Configuración, no dato del estudio:
    se corrige y se borra. */
export interface GlossaryActor {
  name: string;
  description: string;
  /** No distingue a nadie: aplica a cualquiera. «Usuario» en un requisito de
      sesión no dice quién lo pide, dice que no depende de quién sos. Se marca
      para no comparar su conteo con el de un rol de dominio. */
  transversal: boolean;
}

export const fetchGlossary = (projectId: string): Promise<GlossaryActor[]> =>
  request<GlossaryActor[]>(`/projects/${projectId}/glossary`);

export const addGlossaryActor = (
  projectId: string,
  name: string,
  description: string,
  transversal = false,
): Promise<GlossaryActor> =>
  request<GlossaryActor>(`/projects/${projectId}/glossary`, {
    method: "POST",
    body: JSON.stringify({ name, description, transversal }),
  });

export const updateGlossaryActor = (
  projectId: string,
  name: string,
  description: string,
  transversal: boolean,
): Promise<GlossaryActor> =>
  request<GlossaryActor>(
    `/projects/${projectId}/glossary/${encodeURIComponent(name)}`,
    { method: "PUT", body: JSON.stringify({ description, transversal }) },
  );

export const removeGlossaryActor = (
  projectId: string,
  name: string,
): Promise<void> =>
  request<void>(
    `/projects/${projectId}/glossary/${encodeURIComponent(name)}`,
    { method: "DELETE" },
  );

/** Un criterio de aceptación de un requisito, en formato BDD.

    SWEBOK v4 §4.3 los escribe como «Given <some context> when <stimulus>
    then <outcome>»; las tres partes se llaman como el estándar las nombra. */
export type CriterionKind = "scenario" | "question";

export interface AcceptanceCriterion {
  id: number;
  requirementId: string;
  /** Revisión del requisito contra la que se escribió. Si el requisito
      cambió después, el criterio quedó desactualizado. */
  writtenAgainst: number;
  kind: CriterionKind;
  name: string;
  context: string;
  stimulus: string;
  outcome: string;
  /** Cuando no se pudo escribir el criterio sin volver a preguntar. No es un
      hueco del registro: es con lo que se mide la ambigüedad. */
  question: string;
  askTo: string;
  author: string;
}

export const fetchCriteria = (
  projectId: string,
): Promise<AcceptanceCriterion[]> =>
  request<AcceptanceCriterion[]>(`/projects/${projectId}/criteria`);

export const addCriterion = (
  projectId: string,
  criterion: {
    requirementId: string;
    writtenAgainst: number;
    kind: CriterionKind;
    author: string;
    name?: string;
    context?: string;
    stimulus?: string;
    outcome?: string;
    question?: string;
    askTo?: string;
  },
): Promise<AcceptanceCriterion> =>
  request<AcceptanceCriterion>(`/projects/${projectId}/criteria`, {
    method: "POST",
    body: JSON.stringify(criterion),
  });

export const removeCriterion = (
  projectId: string,
  criterionId: number,
): Promise<void> =>
  request<void>(`/projects/${projectId}/criteria/${criterionId}`, {
    method: "DELETE",
  });

/** Qué se decidió sobre un nombre de actor del documento.

    Decidir no arregla nada: el requisito sigue diciendo lo que decía y el log
    es inmutable. Por eso no hay «resuelto», hay «decidido», y cada decisión
    deja un pendiente que se aplica al revisar una reunión futura. */
export type ActorOutcome = "same" | "new" | "wrong";

export interface ActorDecision {
  /** El nombre tal como aparece escrito en los requisitos. */
  observed: string;
  outcome: ActorOutcome;
  /** El rol que rige. Obligatorio para «same». */
  role: string | null;
  note: string;
}

export const fetchActorDecisions = (
  projectId: string,
): Promise<ActorDecision[]> =>
  request<ActorDecision[]>(`/projects/${projectId}/actor-decisions`);

export const recordActorDecision = (
  projectId: string,
  decision: {
    observed: string;
    outcome: ActorOutcome;
    role?: string | null;
    note?: string;
  },
): Promise<ActorDecision> =>
  request<ActorDecision>(`/projects/${projectId}/actor-decisions`, {
    method: "PUT",
    body: JSON.stringify(decision),
  });

export const forgetActorDecision = (
  projectId: string,
  observed: string,
): Promise<void> =>
  request<void>(
    `/projects/${projectId}/actor-decisions/${encodeURIComponent(observed)}`,
    { method: "DELETE" },
  );

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
  /** Archivo de texto del que salieron los turnos, si se importó. `null`
      si vienen del audio o todavía no hay. */
  transcriptFilename: string | null;
  transcriptFormat: "txt" | "vtt" | null;
}

/**
 * Sube un archivo de la reunión: el audio o la transcripción ya hecha.
 *
 * Va como multipart y sin `Content-Type` propio: el navegador tiene que
 * poner el suyo con el `boundary`, y fijarlo a mano rompe el parseo.
 */
async function uploadMeetingFile<T>(
  meetingId: string,
  kind: "audio" | "transcript",
  file: File,
): Promise<T> {
  const body = new FormData();
  body.append("file", file);

  const response = await fetch(
    `${BASE}/meetings/${encodeURIComponent(meetingId)}/${kind}`,
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

/** Sube el audio de una reunión. Sus turnos salen de transcribirlo. */
export const uploadAudio = (meetingId: string, file: File) =>
  uploadMeetingFile<{ filename: string; sizeBytes: number; sha256: string }>(
    meetingId,
    "audio",
    file,
  );

/** Sube la transcripción ya hecha (.txt «Hablante: texto» o .vtt), la
 *  alternativa al audio: los turnos salen del archivo. */
export const uploadTranscript = (meetingId: string, file: File) =>
  uploadMeetingFile<{
    filename: string;
    format: "txt" | "vtt";
    sha256: string;
    turnCount: number;
    speakers: string[];
  }>(meetingId, "transcript", file);

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

/** Lo que decidió un revisor sobre una propuesta. */
export interface ProposalDecision {
  participantId: string;
  participantName: string | null;
  action: ReviewAction;
  editedContent: string | null;
  /** Cuánto tardó en decidir. */
  seconds: number;
}

export interface ProposalConsolidation {
  outcome: "adopt" | "drop" | "rewrite";
  chosenFrom: string | null;
  resolvedBy: string;
  reason: string;
  content: string | null;
}

/**
 * Una propuesta del agente con sus citas y las decisiones de cada revisor.
 * No trae la marca de defecto: la revisión es a ciegas y esta vista no puede
 * revelar cuáles fueron sembradas.
 */
export interface MeetingProposal {
  id: string;
  iteration: number;
  operation: "create" | "modify" | "delete" | "conflict";
  targetId: string;
  previousContent: string | null;
  content: string | null;
  sourceTurnIds: number[];
  rationale: string;
  signals: Array<{ rule: string; label: string; detail: string }>;
  theme: string | null;
  decisions: ProposalDecision[];
  consolidation: ProposalConsolidation | null;
}

export const fetchMeetingProposals = (
  meetingId: string,
): Promise<MeetingProposal[]> =>
  request<MeetingProposal[]>(
    `/meetings/${encodeURIComponent(meetingId)}/proposals`,
  );

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

export function fetchRejections(
  projectId: string,
  participantId?: string,
): Promise<Rejection[]> {
  const q = participantId ? `?participant=${encodeURIComponent(participantId)}` : "";
  return request<Rejection[]>(`/projects/${projectId}/rejections${q}`);
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

/** Cifras por iteración de una persona.
 *
 *  El participante no es opcional en la práctica: cada revisor produce su
 *  propia serie sobre la misma cola, y pedirlas sin él devuelve una mediana
 *  que mezcla dos personas y no describe a ninguna. */
export interface AgreementRow {
  proposalId: string;
  iteration: number;
  targetId: string;
  operation: ProposalOperation;
  knownDefective: boolean;
  defectKind: string | null;
  /** participante → acción decidida. */
  decisions: Record<string, ReviewAction>;
  /** participante → texto que dejó. */
  texts: Record<string, string>;
  /** Los textos resultantes difieren, aunque la acción sea la misma. */
  textDiffers: boolean;
  /** De quién se adoptó la versión, si el desacuerdo ya se resolvió. */
  chosenFrom: string | null;
  resolvedBy: string | null;
  consolidationReason: string | null;
  /** `adopt`, `drop` o `rewrite`. Nulo si no se resolvió. */
  outcome: string | null;
  consolidatedContent: string | null;
  /** Los revisores no coincidieron. */
  disputed: boolean;
  reviewers: number;
}

/** Adopta la versión de un revisor para la especificación.
 *
 *  No altera las decisiones: cada una queda como el dato que es. Esto se
 *  apoya encima y dice cuál rige en el documento. */
export type ConsolidationOutcome = "adopt" | "drop" | "rewrite";

export async function consolidate(
  proposalId: string,
  input: {
    outcome: ConsolidationOutcome;
    resolvedBy: string;
    reason: string;
    /** Sólo con `adopt`. */
    chosenFrom?: string;
    /** Sólo con `rewrite`. */
    content?: string;
  },
): Promise<void> {
  await request<void>(`/proposals/${encodeURIComponent(proposalId)}/consolidation`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

/** Qué decidió cada revisor sobre cada propuesta. */
export function fetchAgreement(projectId: string): Promise<AgreementRow[]> {
  return request<AgreementRow[]>(`/projects/${projectId}/agreement`);
}

export function fetchMetrics(
  projectId: string,
  participantId?: string,
): Promise<IterationMetrics[]> {
  const q = participantId ? `?participant=${encodeURIComponent(participantId)}` : "";
  return request<IterationMetrics[]>(`/projects/${projectId}/metrics${q}`);
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
