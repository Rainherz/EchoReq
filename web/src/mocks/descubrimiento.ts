/**
 * Discovery fixture: meeting 1 of the Clínica Norte project.
 *
 * There is no prior documentation, so the agent generates a first draft
 * instead of proposing changes. Every candidate is a `create`, and the
 * accepted set becomes revision 1 — the baseline the whole chain inherits.
 *
 * Two candidates carry an ambiguity signal. The client raised the topic
 * without stating the rule, and the agent flags the gap rather than filling
 * it: inventing the missing policy is the failure mode the study observes.
 */

import type { ChangeProposal, Turn } from "../requirements/domain/types";

export const DISCOVERY_MEETING_ID = "m-2026-08-20";

const turn = (
  id: number,
  speaker: Turn["speaker"],
  startsAt: string,
  text: string,
): Turn => ({ id, meetingId: DISCOVERY_MEETING_ID, speaker, startsAt, text });

export const discoveryTurns: Turn[] = [
  turn(44, "AN", "11:58", "Contame cómo sacan turno hoy los pacientes."),
  turn(45, "CL", "12:01", "Llaman por teléfono, o vienen directamente al mostrador."),
  turn(46, "PO", "12:04", "¿Y eso les genera problemas?"),
  turn(47, "CL", "12:06", "Lo ideal sería que el paciente lo saque solo desde el celular, sin llamar a nadie."),
  turn(48, "CL", "12:14", "Claro, y que vea los horarios que están libres."),
  turn(49, "PO", "12:21", "Eso. Y si después no puede venir, que cancele ahí mismo."),
  turn(50, "CL", "12:30", "Pero ojo con las cancelaciones de último momento, eh."),
  turn(51, "CL", "12:41", "Si avisan con menos de un día ya no llegamos a llenar el hueco. Ahí habría que cobrarles algo, la mitad digamos."),
  turn(61, "CL", "18:05", "Igual la recepcionista va a tener que poder cargar turnos a mano, porque los pacientes grandes no usan la app ni loco."),
  turn(62, "AN", "18:19", "¿Los carga con los mismos datos?"),
  turn(63, "CL", "18:24", "Sí, nombre y obra social. A veces el teléfono no lo pedimos."),
  turn(72, "CL", "22:40", "A la mañana lo primero que hace la recepcionista es mirar quién viene ese día, para acomodar la sala."),
  turn(73, "PO", "22:52", "O sea que necesita la agenda del día a mano."),
  turn(95, "CL", "29:15", "Y algo que ayudaría un montón: mandarles un recordatorio por WhatsApp el día anterior."),
  turn(96, "AN", "29:28", "¿Con cuánta anticipación?"),
  turn(97, "CL", "29:31", "Un día antes está bien."),
  turn(112, "CL", "34:02", "Ah, y los médicos necesitan poder marcar cuando no van a estar."),
  turn(118, "CL", "34:20", "Si el doctor avisa que se toma la semana, esos horarios no se tienen que poder reservar."),
  turn(131, "CL", "38:44", "Después vemos lo de los estudios que necesitan preparación previa, que es otro tema."),
  turn(132, "PO", "38:55", "Lo dejamos para la próxima entonces."),
];

export const discoveryCandidates: ChangeProposal[] = [
  {
    id: "c-01",
    iteration: 1,
    operation: "create",
    targetId: "R-01",
    content:
      "Como paciente quiero reservar un turno desde el celular, para no tener que llamar por teléfono.",
    sourceTurnIds: [44, 45, 47],
    rationale: "El cliente describe el canal telefónico como el problema a resolver.",
    signals: [],
    theme: "Reserva",
  },
  {
    id: "c-02",
    iteration: 1,
    operation: "create",
    targetId: "R-02",
    content:
      "Como paciente quiero ver los horarios disponibles al reservar, para elegir el que me sirve.",
    sourceTurnIds: [48],
    rationale: "Requisito de visibilidad de disponibilidad enunciado explícitamente.",
    signals: [],
    theme: "Reserva",
  },
  {
    id: "c-03",
    iteration: 1,
    operation: "create",
    targetId: "R-03",
    content:
      "Como paciente quiero cancelar un turno desde la aplicación, para liberar el horario si no puedo asistir.",
    sourceTurnIds: [49],
    rationale: "Cancelación autogestionada mencionada como continuación de la reserva.",
    signals: [],
    theme: "Cancelación",
  },
  {
    id: "c-04",
    iteration: 1,
    operation: "create",
    targetId: "R-04",
    content:
      "Si la cancelación ocurre con menos de 24 h de anticipación, el sistema aplica un cargo del 50% del valor de la consulta.",
    sourceTurnIds: [50, 51],
    rationale: "El cliente enuncia el plazo y el porcentaje del cargo.",
    signals: [],
    theme: "Cancelación",
  },
  {
    id: "c-05",
    iteration: 1,
    operation: "create",
    targetId: "R-05",
    content:
      "El sistema debe definir cómo se cobra el cargo por cancelación tardía.",
    sourceTurnIds: [51],
    rationale:
      "Se enuncia el cargo pero no el medio de cobro ni qué pasa si el paciente no pagó por adelantado.",
    signals: [
      {
        rule: "unambiguous",
        label: "Ambiguo",
        detail:
          "No se dijo cómo se cobra, ni si aplica cuando no hubo pago previo. El requisito queda incompleto a propósito: completar el hueco sería inventar la política.",
      },
    ],
    theme: "Cancelación",
  },
  {
    id: "c-06",
    iteration: 1,
    operation: "create",
    targetId: "R-06",
    content:
      "Como recepcionista quiero cargar turnos tomados por teléfono, para atender a pacientes que no usan la aplicación.",
    sourceTurnIds: [61, 62, 63],
    rationale: "Canal manual requerido por el perfil de paciente mayor.",
    signals: [],
    theme: "Carga manual",
  },
  {
    id: "c-07",
    iteration: 1,
    operation: "create",
    targetId: "R-07",
    content:
      "El sistema debe registrar qué datos son obligatorios al cargar un turno manualmente.",
    sourceTurnIds: [63],
    rationale:
      "Se mencionan nombre y obra social como habituales, y el teléfono como opcional, sin definir la regla.",
    signals: [
      {
        rule: "unambiguous",
        label: "Ambiguo",
        detail:
          "«A veces el teléfono no lo pedimos» no establece una regla. Sin el teléfono el paciente queda fuera del circuito de recordatorios.",
      },
    ],
    theme: "Carga manual",
  },
  {
    id: "c-08",
    iteration: 1,
    operation: "create",
    targetId: "R-08",
    content:
      "Como recepcionista quiero ver la agenda del día para organizar la sala de espera.",
    sourceTurnIds: [72, 73],
    rationale: "Rutina de inicio de jornada descrita por el cliente.",
    signals: [],
    theme: "Agenda",
  },
  {
    id: "c-09",
    iteration: 1,
    operation: "create",
    targetId: "R-09",
    content:
      "El sistema debe enviar un recordatorio por WhatsApp 24 h antes del turno.",
    sourceTurnIds: [95, 96, 97],
    rationale: "Canal y anticipación enunciados explícitamente.",
    signals: [],
    theme: "Recordatorios",
  },
  {
    id: "c-10",
    iteration: 1,
    operation: "create",
    targetId: "R-10",
    content:
      "Como médico quiero bloquear franjas horarias por ausencia, para que no se puedan reservar.",
    sourceTurnIds: [112, 118],
    rationale: "Bloqueo de disponibilidad por ausencia del profesional.",
    signals: [],
    theme: "Disponibilidad",
  },
];
