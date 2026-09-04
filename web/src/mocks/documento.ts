/**
 * Append-only requirement log for the Clínica Norte fixture.
 *
 * Three revisions, one per meeting. Revision 1 comes from discovery mode:
 * there was no prior documentation, so every entry is a `create`.
 *
 * R-02 is the requirement the study design uses to illustrate drift. It keeps
 * absorbing clauses that should have become separate requirements, and the
 * refund obligation implied in meeting 2 was never written down at all.
 */

import type { RequirementRevision } from "../requirements/domain/document";

export const CURRENT_REVISION = 3;

export const MEETINGS: Record<number, { id: string; label: string; date: string }> = {
  1: { id: "m-2026-08-20", label: "Reunión 1 · relevamiento", date: "20 ago 2026" },
  2: { id: "m-2026-09-03", label: "Reunión 2 · recordatorios", date: "03 sep 2026" },
  3: { id: "m-2026-09-17", label: "Reunión 3 · cancelaciones", date: "17 sep 2026" },
};

export const requirementLog: RequirementRevision[] = [
  // ---- revisión 1 · modo descubrimiento -------------------------------
  {
    requirementId: "R-01",
    revision: 1,
    meetingId: MEETINGS[1].id,
    operation: "create",
    content:
      "Como paciente quiero reservar un turno desde el celular, para no tener que llamar por teléfono.",
    sourceTurnIds: [44, 47, 48],
    summary: "Nace en el primer borrador.",
  },
  {
    requirementId: "R-02",
    revision: 1,
    meetingId: MEETINGS[1].id,
    operation: "create",
    content:
      "Como paciente quiero cancelar un turno hasta 24 h antes sin costo. Si la cancelación ocurre con menos de 24 h, se aplica un cargo del 50%.",
    sourceTurnIds: [49, 50, 51],
    summary: "Nace con la política de cancelación y el cargo por aviso tardío.",
  },
  {
    requirementId: "R-03",
    revision: 1,
    meetingId: MEETINGS[1].id,
    operation: "create",
    content:
      "Como recepcionista quiero ver la agenda del día para organizar la sala de espera.",
    sourceTurnIds: [72],
    summary: "Nace en el primer borrador.",
  },
  {
    requirementId: "R-04",
    revision: 1,
    meetingId: MEETINGS[1].id,
    operation: "create",
    content:
      "El sistema debe enviar un recordatorio por WhatsApp 24 h antes del turno.",
    sourceTurnIds: [95],
    summary: "Nace en el primer borrador.",
  },
  {
    requirementId: "R-05",
    revision: 1,
    meetingId: MEETINGS[1].id,
    operation: "create",
    content:
      "Como médico quiero bloquear franjas horarias por ausencia.",
    sourceTurnIds: [118],
    summary: "Nace en el primer borrador.",
  },
  {
    requirementId: "R-06",
    revision: 1,
    meetingId: MEETINGS[1].id,
    operation: "create",
    content:
      "Como recepcionista quiero cargar turnos tomados por teléfono, para atender a pacientes que no usan la aplicación.",
    sourceTurnIds: [61],
    summary: "Nace en el primer borrador.",
  },

  // ---- revisión 2 · reunión 2 -----------------------------------------
  {
    requirementId: "R-04",
    revision: 2,
    meetingId: MEETINGS[2].id,
    operation: "modify",
    content:
      "El sistema debe enviar un recordatorio por WhatsApp 24 h antes del turno, con envío de SMS de respaldo cuando el paciente no tenga WhatsApp disponible.",
    sourceTurnIds: [23],
    summary: "Se agrega el SMS de respaldo para pacientes sin WhatsApp.",
  },
  {
    requirementId: "R-02",
    revision: 2,
    meetingId: MEETINGS[2].id,
    operation: "modify",
    content:
      "Como paciente quiero cancelar un turno hasta 24 h antes sin costo. Si la cancelación ocurre con menos de 24 h, se aplica un cargo del 50%, excepto cuando la cancelación la origina el profesional.",
    sourceTurnIds: [88],
    summary:
      "Se agrega la excepción del profesional. El reembolso implicado en el mismo turno no se documentó.",
  },

  // ---- revisión 3 · reunión 3 -----------------------------------------
  {
    requirementId: "R-03",
    revision: 3,
    meetingId: MEETINGS[3].id,
    operation: "modify",
    content:
      "Como recepcionista quiero ver la agenda del día, distinguiendo los turnos confirmados de los no confirmados, para organizar la sala de espera.",
    sourceTurnIds: [27, 28, 29],
    summary: "Se agrega el estado de confirmación a la vista de agenda.",
  },
  {
    requirementId: "R-02",
    revision: 3,
    meetingId: MEETINGS[3].id,
    operation: "modify",
    content:
      "Como paciente quiero cancelar un turno hasta 24 h antes sin costo. Si la cancelación ocurre con menos de 24 h, se aplica un cargo del 50%, excepto cuando la cancelación la origina el profesional, en cuyo caso el paciente puede reprogramar desde la notificación recibida.",
    sourceTurnIds: [12, 13, 14],
    summary:
      "Se agrega la reprogramación. El agente amplió R-02 porque ahí había quedado la excepción del profesional.",
  },
  {
    requirementId: "R-07",
    revision: 3,
    meetingId: MEETINGS[3].id,
    operation: "create",
    content:
      "Como recepcionista quiero que el teléfono de contacto sea obligatorio al cargar un turno telefónico, para que el paciente reciba el recordatorio.",
    sourceTurnIds: [41, 42, 43],
    summary: "Nace para cerrar el circuito de recordatorios en turnos telefónicos.",
  },
  {
    requirementId: "R-04",
    revision: 3,
    meetingId: MEETINGS[3].id,
    operation: "modify",
    content:
      "El sistema debe enviar un recordatorio por WhatsApp 24 h antes del turno, con envío de SMS de respaldo cuando el paciente no tenga WhatsApp disponible, y debe permitir confirmar la asistencia desde el mensaje.",
    sourceTurnIds: [9, 27],
    summary: "Se agrega la confirmación de asistencia desde el mensaje.",
  },
];

/**
 * Proposals that were rejected and therefore left no trace in the document.
 *
 * Kept because a rejected proposal is as informative as an accepted one: the
 * postoperative cancellation rule was raised, discussed, discarded, and now
 * exists nowhere in the specification.
 */
export const rejectedInRevision: Array<{
  revision: number;
  targetId: string;
  note: string;
}> = [
  {
    revision: 3,
    targetId: "R-02",
    note: "Conflicto: los controles postoperatorios no admiten cancelación online. Rechazado, sin requisito de reemplazo.",
  },
];
