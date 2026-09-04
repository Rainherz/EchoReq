/**
 * Hand-loaded fixture: meeting 3 of the Clínica Norte appointment system.
 *
 * The review screen is built before the pipeline exists precisely so the
 * instrumentation can be validated against known content. Proposal `p-02`
 * carries the inherited defect described in the study design: R-02 keeps
 * absorbing clauses that should have become separate requirements.
 */

import type { ChangeProposal, Turn } from "../requirements/domain/types";

export const MEETING_ID = "m-2026-09-17";

export const turns: Turn[] = [
  { id: 8, meetingId: MEETING_ID, speaker: "AN", startsAt: "05:52", text: "Arranquemos por lo del recordatorio, que quedó a medias la vez pasada." },
  { id: 9, meetingId: MEETING_ID, speaker: "CL", startsAt: "06:05", text: "Sí. El SMS ya lo estamos mandando y funcionó bien con los pacientes mayores." },
  { id: 10, meetingId: MEETING_ID, speaker: "PO", startsAt: "06:28", text: "Bien. El tema ahora es cuando se cae el médico." },
  { id: 11, meetingId: MEETING_ID, speaker: "CL", startsAt: "06:34", text: "Sí, eso pasa bastante seguido, más de lo que quisiéramos." },
  { id: 12, meetingId: MEETING_ID, speaker: "CL", startsAt: "06:40", text: "Cuando el médico cancela, el paciente tendría que poder reprogramar directo desde el mismo mensaje que le llega." },
  { id: 13, meetingId: MEETING_ID, speaker: "AN", startsAt: "06:58", text: "Sin volver a entrar a la app, claro." },
  { id: 14, meetingId: MEETING_ID, speaker: "CL", startsAt: "07:11", text: "Exacto. Que le aparezcan tres horarios y elija." },
  { id: 27, meetingId: MEETING_ID, speaker: "CL", startsAt: "14:20", text: "Otra cosa: la recepcionista necesita ver quién confirmó y quién no, antes de que arranque el turno." },
  { id: 28, meetingId: MEETING_ID, speaker: "PO", startsAt: "14:38", text: "¿En la misma agenda del día o aparte?" },
  { id: 29, meetingId: MEETING_ID, speaker: "CL", startsAt: "14:44", text: "En la misma, con un color distinto o algo así." },
  { id: 41, meetingId: MEETING_ID, speaker: "CL", startsAt: "22:03", text: "Y los turnos que se sacan por teléfono, ¿esos también reciben el recordatorio?" },
  { id: 42, meetingId: MEETING_ID, speaker: "AN", startsAt: "22:15", text: "Hoy no, porque no siempre cargamos el celular del paciente." },
  { id: 43, meetingId: MEETING_ID, speaker: "CL", startsAt: "22:26", text: "Entonces habría que pedirlo obligatorio cuando cargan por teléfono." },
  { id: 58, meetingId: MEETING_ID, speaker: "CL", startsAt: "31:47", text: "Ah, y algo que me olvidaba: los turnos de control post operatorio no se pueden cancelar online, esos van sí o sí por teléfono." },
  { id: 59, meetingId: MEETING_ID, speaker: "PO", startsAt: "32:02", text: "Eso choca con lo que definimos de cancelación, ojo." },
];

export const proposals: ChangeProposal[] = [
  {
    id: "p-01",
    iteration: 3,
    operation: "modify",
    targetId: "R-03",
    previousContent:
      "Como recepcionista quiero ver la agenda del día para organizar la sala de espera.",
    content:
      "Como recepcionista quiero ver la agenda del día, distinguiendo los turnos confirmados de los no confirmados, para organizar la sala de espera.",
    sourceTurnIds: [27, 28, 29],
    rationale:
      "La recepción necesita el estado de confirmación dentro de la misma vista de agenda.",
    signals: [],
  },
  {
    id: "p-02",
    iteration: 3,
    operation: "modify",
    targetId: "R-02",
    previousContent:
      "Como paciente quiero cancelar un turno hasta 24 h antes sin costo. Si la cancelación ocurre con menos de 24 h, se aplica un cargo del 50%, excepto cuando la cancelación la origina el profesional.",
    content:
      "Como paciente quiero cancelar un turno hasta 24 h antes sin costo. Si la cancelación ocurre con menos de 24 h, se aplica un cargo del 50%, excepto cuando la cancelación la origina el profesional, en cuyo caso el paciente puede reprogramar desde la notificación recibida.",
    sourceTurnIds: [12, 13, 14],
    rationale:
      "El cliente pide reprogramación cuando la cancelación la origina el profesional.",
    signals: [
      {
        rule: "atomicity",
        label: "Atomicidad",
        detail:
          "R-02 pasaría a cubrir 4 responsabilidades: cancelación, cargo, excepción del profesional y reprogramación. Puede convenir dividirlo.",
      },
      {
        rule: "minimal",
        label: "Minimalidad",
        detail: "La historia excede una oración y acumula cláusulas condicionales.",
      },
    ],
  },
  {
    id: "p-03",
    iteration: 3,
    operation: "create",
    targetId: "R-07",
    content:
      "Como recepcionista quiero que el teléfono de contacto sea obligatorio al cargar un turno telefónico, para que el paciente reciba el recordatorio.",
    sourceTurnIds: [41, 42, 43],
    rationale:
      "Los turnos cargados por teléfono quedan fuera del circuito de recordatorios por falta de dato de contacto.",
    signals: [],
  },
  {
    id: "p-04",
    iteration: 3,
    operation: "conflict",
    targetId: "R-02",
    previousContent:
      "Como paciente quiero cancelar un turno hasta 24 h antes sin costo. Si la cancelación ocurre con menos de 24 h, se aplica un cargo del 50%, excepto cuando la cancelación la origina el profesional.",
    content:
      "Los turnos de control postoperatorio no admiten cancelación online. Contradice la política general de cancelación establecida en R-02.",
    sourceTurnIds: [58, 59],
    rationale:
      "El cliente enuncia una excepción por tipo de turno que la política vigente no contempla.",
    signals: [
      {
        rule: "conflict-free",
        label: "Conflicto",
        detail: "Incompatible con R-02 en su redacción vigente.",
      },
    ],
  },
  {
    id: "p-05",
    iteration: 3,
    operation: "modify",
    targetId: "R-04",
    previousContent:
      "El sistema debe enviar un recordatorio por WhatsApp 24 h antes del turno, con envío de SMS de respaldo cuando el paciente no tenga WhatsApp disponible.",
    content:
      "El sistema debe enviar un recordatorio por WhatsApp 24 h antes del turno, con envío de SMS de respaldo cuando el paciente no tenga WhatsApp disponible, y debe permitir confirmar la asistencia desde el mensaje.",
    sourceTurnIds: [9, 27],
    rationale:
      "La confirmación de asistencia que pide la recepción necesita un canal de entrada.",
    signals: [
      {
        rule: "atomicity",
        label: "Atomicidad",
        detail: "R-04 sumaría el circuito de confirmación al de notificación.",
      },
    ],
  },
];
