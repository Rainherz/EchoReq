"""Carga el fixture Clínica Norte en la base.

Reproduce el mismo caso que usa el frontend: tres reuniones encadenadas donde
R-02 acumula cláusulas que deberían haber sido requisitos separados.

La propuesta ``p-02`` va marcada como ``known_defective``: el guion de
inyección sabe que colapsar el reembolso dentro de R-02 es incorrecto. Esa
marca es el denominador de la métrica de aceptación de propuestas defectuosas.

Uso:  .venv/bin/python seed.py [--reset] [--with-decisions]

``--with-decisions`` agrega propuestas y decisiones en las iteraciones 1 y 2
para que las curvas del panel del estudio tengan serie. Son datos INVENTADOS
con fines de demostración, no observaciones: reproducen el patrón que el
estudio busca detectar en lugar de medirlo. Nunca cargarlos sobre una base
con datos reales.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone

from app.adapters.persistence.pool import close_pool, cursor

PROJECT = "clinica-norte"
TZ = timezone(timedelta(hours=-3))

MEETINGS = [
    ("m-2026-08-20", 1, "Reunión 1 · relevamiento", datetime(2026, 8, 20, 14, 0, tzinfo=TZ), "discovery"),
    ("m-2026-09-03", 2, "Reunión 2 · recordatorios", datetime(2026, 9, 3, 14, 0, tzinfo=TZ), "living"),
    ("m-2026-09-17", 3, "Reunión 3 · cancelaciones", datetime(2026, 9, 17, 14, 0, tzinfo=TZ), "living"),
]

TURNS = [
    ("m-2026-09-17", 8, "AN", "05:52", "Arranquemos por lo del recordatorio, que quedó a medias la vez pasada."),
    ("m-2026-09-17", 9, "CL", "06:05", "Sí. El SMS ya lo estamos mandando y funcionó bien con los pacientes mayores."),
    ("m-2026-09-17", 10, "PO", "06:28", "Bien. El tema ahora es cuando se cae el médico."),
    ("m-2026-09-17", 11, "CL", "06:34", "Sí, eso pasa bastante seguido, más de lo que quisiéramos."),
    ("m-2026-09-17", 12, "CL", "06:40", "Cuando el médico cancela, el paciente tendría que poder reprogramar directo desde el mismo mensaje que le llega."),
    ("m-2026-09-17", 13, "AN", "06:58", "Sin volver a entrar a la app, claro."),
    ("m-2026-09-17", 14, "CL", "07:11", "Exacto. Que le aparezcan tres horarios y elija."),
    ("m-2026-09-17", 27, "CL", "14:20", "Otra cosa: la recepcionista necesita ver quién confirmó y quién no, antes de que arranque el turno."),
    ("m-2026-09-17", 28, "PO", "14:38", "¿En la misma agenda del día o aparte?"),
    ("m-2026-09-17", 29, "CL", "14:44", "En la misma, con un color distinto o algo así."),
    ("m-2026-09-17", 41, "CL", "22:03", "Y los turnos que se sacan por teléfono, ¿esos también reciben el recordatorio?"),
    ("m-2026-09-17", 42, "AN", "22:15", "Hoy no, porque no siempre cargamos el celular del paciente."),
    ("m-2026-09-17", 43, "CL", "22:26", "Entonces habría que pedirlo obligatorio cuando cargan por teléfono."),
    ("m-2026-09-17", 58, "CL", "31:47", "Ah, y los turnos de control postoperatorio no se pueden cancelar online, esos van sí o sí por teléfono."),
    ("m-2026-09-17", 59, "PO", "32:02", "Eso choca con lo que definimos de cancelación, ojo."),
]


# --- Reunión 1, modo descubrimiento -----------------------------------------
# Estos turnos y candidatos vivían en un mock del frontend. Están acá porque la
# pantalla de Descubrimiento tiene que leer lo mismo que las demás: la base.
TURNS_D1 = [
    ("m-2026-08-20", 44, "AN", "11:58", "Contame cómo sacan turno hoy los pacientes."),
    ("m-2026-08-20", 45, "CL", "12:01", "Llaman por teléfono, o vienen directamente al mostrador."),
    ("m-2026-08-20", 46, "PO", "12:04", "¿Y eso les genera problemas?"),
    ("m-2026-08-20", 47, "CL", "12:06", "Lo ideal sería que el paciente lo saque solo desde el celular, sin llamar a nadie."),
    ("m-2026-08-20", 48, "CL", "12:14", "Claro, y que vea los horarios que están libres."),
    ("m-2026-08-20", 49, "PO", "12:21", "Eso. Y si después no puede venir, que cancele ahí mismo."),
    ("m-2026-08-20", 50, "CL", "12:30", "Pero ojo con las cancelaciones de último momento, eh."),
    ("m-2026-08-20", 51, "CL", "12:41", "Si avisan con menos de un día ya no llegamos a llenar el hueco. Ahí habría que cobrarles algo, la mitad digamos."),
    ("m-2026-08-20", 61, "CL", "18:05", "Igual la recepcionista va a tener que poder cargar turnos a mano, porque los pacientes grandes no usan la app ni loco."),
    ("m-2026-08-20", 62, "AN", "18:19", "¿Los carga con los mismos datos?"),
    ("m-2026-08-20", 63, "CL", "18:24", "Sí, nombre y obra social. A veces el teléfono no lo pedimos."),
    ("m-2026-08-20", 72, "CL", "22:40", "A la mañana lo primero que hace la recepcionista es mirar quién viene ese día, para acomodar la sala."),
    ("m-2026-08-20", 73, "PO", "22:52", "O sea que necesita la agenda del día a mano."),
    ("m-2026-08-20", 95, "CL", "29:15", "Y algo que ayudaría un montón: mandarles un recordatorio por WhatsApp el día anterior."),
    ("m-2026-08-20", 96, "AN", "29:28", "¿Con cuánta anticipación?"),
    ("m-2026-08-20", 97, "CL", "29:31", "Un día antes está bien."),
    ("m-2026-08-20", 112, "CL", "34:02", "Ah, y los médicos necesitan poder marcar cuando no van a estar."),
    ("m-2026-08-20", 118, "CL", "34:20", "Si el doctor avisa que se toma la semana, esos horarios no se tienen que poder reservar."),
    ("m-2026-08-20", 131, "CL", "38:44", "Después vemos lo de los estudios que necesitan preparación previa, que es otro tema."),
    ("m-2026-08-20", 132, "PO", "38:55", "Lo dejamos para la próxima entonces."),
]

AMBIGUO_COBRO = {
    "rule": "unambiguous",
    "label": "Ambiguo",
    "detail": "No se dijo cómo se cobra, ni si aplica cuando no hubo pago previo. El requisito queda incompleto a propósito: completar el hueco sería inventar la política.",
}
AMBIGUO_DATOS = {
    "rule": "unambiguous",
    "label": "Ambiguo",
    "detail": "«A veces el teléfono no lo pedimos» no establece una regla. Sin el teléfono el paciente queda fuera del circuito de recordatorios.",
}

# (id, operación, objetivo, contenido, turnos, justificación, señales, tema)
CANDIDATES_D1 = [
    ("c-01-01", "create", "R-01", "Como paciente quiero reservar un turno desde el celular, para no tener que llamar por teléfono.", [44, 45, 47], "El cliente describe el canal telefónico como el problema a resolver.", [], "Reserva"),
    ("c-01-02", "create", "R-02", "Como paciente quiero ver los horarios disponibles al reservar, para elegir el que me sirve.", [48], "Visibilidad de disponibilidad enunciada explícitamente.", [], "Reserva"),
    ("c-01-03", "create", "R-03", "Como paciente quiero cancelar un turno desde la aplicación, para liberar el horario si no puedo asistir.", [49], "Cancelación autogestionada mencionada como continuación de la reserva.", [], "Cancelación"),
    ("c-01-04", "create", "R-04", "Si la cancelación ocurre con menos de 24 h de anticipación, el sistema aplica un cargo del 50% del valor de la consulta.", [50, 51], "El cliente enuncia el plazo y el porcentaje.", [], "Cancelación"),
    ("c-01-05", "create", "R-05", "El sistema debe definir cómo se cobra el cargo por cancelación tardía.", [51], "Se enuncia el cargo pero no el medio de cobro.", [AMBIGUO_COBRO], "Cancelación"),
    ("c-01-06", "create", "R-06", "Como recepcionista quiero cargar turnos tomados por teléfono, para atender a pacientes que no usan la aplicación.", [61, 62, 63], "Canal manual requerido por el perfil de paciente mayor.", [], "Carga manual"),
    ("c-01-07", "create", "R-07", "El sistema debe registrar qué datos son obligatorios al cargar un turno manualmente.", [63], "Se mencionan nombre y obra social, y el teléfono como opcional, sin definir la regla.", [AMBIGUO_DATOS], "Carga manual"),
    ("c-01-08", "create", "R-08", "Como recepcionista quiero ver la agenda del día para organizar la sala de espera.", [72, 73], "Rutina de inicio de jornada descrita por el cliente.", [], "Agenda"),
    ("c-01-09", "create", "R-09", "El sistema debe enviar un recordatorio por WhatsApp 24 h antes del turno.", [95, 96, 97], "Canal y anticipación enunciados explícitamente.", [], "Recordatorios"),
    ("c-01-10", "create", "R-10", "Como médico quiero bloquear franjas horarias por ausencia, para que no se puedan reservar.", [112, 118], "Bloqueo de disponibilidad por ausencia del profesional.", [], "Disponibilidad"),
]

R02_R1 = "Como paciente quiero cancelar un turno hasta 24 h antes sin costo. Si la cancelación ocurre con menos de 24 h, se aplica un cargo del 50%."
R02_R2 = R02_R1[:-1] + ", excepto cuando la cancelación la origina el profesional."
R02_R3 = R02_R2[:-1] + ", en cuyo caso el paciente puede reprogramar desde la notificación recibida."

R04_R1 = "El sistema debe enviar un recordatorio por WhatsApp 24 h antes del turno."
R04_R2 = R04_R1[:-1] + ", con envío de SMS de respaldo cuando el paciente no tenga WhatsApp disponible."
R04_R3 = R04_R2[:-1] + ", y debe permitir confirmar la asistencia desde el mensaje."

R03_R1 = "Como recepcionista quiero ver la agenda del día para organizar la sala de espera."
R03_R3 = "Como recepcionista quiero ver la agenda del día, distinguiendo los turnos confirmados de los no confirmados, para organizar la sala de espera."

REVISIONS = [
    ("R-01", 1, "m-2026-08-20", "create", "Como paciente quiero reservar un turno desde el celular, para no tener que llamar por teléfono.", [44, 47, 48], "Nace en el primer borrador."),
    ("R-02", 1, "m-2026-08-20", "create", R02_R1, [49, 50, 51], "Nace con la política de cancelación y el cargo por aviso tardío."),
    ("R-03", 1, "m-2026-08-20", "create", R03_R1, [72], "Nace en el primer borrador."),
    ("R-04", 1, "m-2026-08-20", "create", R04_R1, [95], "Nace en el primer borrador."),
    ("R-05", 1, "m-2026-08-20", "create", "Como médico quiero bloquear franjas horarias por ausencia.", [118], "Nace en el primer borrador."),
    ("R-06", 1, "m-2026-08-20", "create", "Como recepcionista quiero cargar turnos tomados por teléfono, para atender a pacientes que no usan la aplicación.", [61], "Nace en el primer borrador."),
    ("R-04", 2, "m-2026-09-03", "modify", R04_R2, [23], "Se agrega el SMS de respaldo."),
    ("R-02", 2, "m-2026-09-03", "modify", R02_R2, [88], "Se agrega la excepción del profesional. El reembolso implicado no se documentó."),
    ("R-03", 3, "m-2026-09-17", "modify", R03_R3, [27, 28, 29], "Se agrega el estado de confirmación."),
    ("R-02", 3, "m-2026-09-17", "modify", R02_R3, [12, 13, 14], "Se agrega la reprogramación sobre la excepción heredada."),
    ("R-07", 3, "m-2026-09-17", "create", "Como recepcionista quiero que el teléfono de contacto sea obligatorio al cargar un turno telefónico, para que el paciente reciba el recordatorio.", [41, 42, 43], "Nace para cerrar el circuito de recordatorios."),
    ("R-04", 3, "m-2026-09-17", "modify", R04_R3, [9, 27], "Se agrega la confirmación de asistencia."),
]

ATOMICITY = {
    "rule": "atomicity",
    "label": "Atomicidad",
    "detail": "R-02 pasaría a cubrir 4 responsabilidades: cancelación, cargo, excepción del profesional y reprogramación.",
}
MINIMAL = {
    "rule": "minimal",
    "label": "Minimalidad",
    "detail": "La historia excede una oración y acumula cláusulas condicionales.",
}
CONFLICT = {
    "rule": "conflict-free",
    "label": "Conflicto",
    "detail": "Incompatible con R-02 en su redacción vigente.",
}

PROPOSALS = [
    ("p-01", "modify", "R-03", R03_R1, R03_R3, [27, 28, 29], "La recepción necesita el estado de confirmación.", [], None, False),
    ("p-02", "modify", "R-02", R02_R2, R02_R3, [12, 13, 14], "El cliente pide reprogramación cuando cancela el profesional.", [ATOMICITY, MINIMAL], None, True),
    ("p-03", "create", "R-07", None, "Como recepcionista quiero que el teléfono de contacto sea obligatorio al cargar un turno telefónico, para que el paciente reciba el recordatorio.", [41, 42, 43], "Los turnos telefónicos quedan fuera del circuito de recordatorios.", [], None, False),
    ("p-04", "conflict", "R-02", R02_R2, "Los turnos de control postoperatorio no admiten cancelación online. Contradice la política general de R-02.", [58, 59], "Excepción por tipo de turno no contemplada.", [CONFLICT], None, False),
    ("p-05", "modify", "R-04", R04_R2, R04_R3, [9, 27], "La confirmación de asistencia necesita un canal de entrada.", [ATOMICITY], None, False),
]


# Propuestas de las iteraciones 1 y 2, solo para la demostración.
DEMO_PROPOSALS = [
    ("d-101", 1, "m-2026-08-20", "create", "R-05", None, "Como médico quiero bloquear franjas horarias por ausencia.", [112, 118], "Bloqueo de disponibilidad.", False),
    ("d-102", 1, "m-2026-08-20", "create", "R-06", None, "Como recepcionista quiero cargar turnos tomados por teléfono.", [61], "Canal manual.", False),
    ("d-103", 1, "m-2026-08-20", "create", "R-01", None, "Como paciente quiero reservar un turno desde el celular.", [44, 47], "Autogestión de reserva.", False),
    ("d-201", 2, "m-2026-09-03", "modify", "R-04", R04_R1, R04_R2, [23], "SMS de respaldo.", False),
    ("d-202", 2, "m-2026-09-03", "modify", "R-02", R02_R1, R02_R2, [88], "Excepción del profesional.", True),
    ("d-203", 2, "m-2026-09-03", "create", "R-08", None, "El sistema debe registrar el motivo de cada cancelación.", [91], "Trazabilidad de cancelaciones.", False),
]

# (propuesta, acción, segundos). El tiempo baja iteración a iteración y la
# defectuosa d-202 se aprueba sin editar: es la forma que el estudio busca.
DEMO_DECISIONS = [
    ("d-103", "accept", 96), ("d-101", "accept", 78), ("d-102", "edit", 112),
    ("d-201", "accept", 61), ("d-202", "accept", 34), ("d-203", "reject", 47),
]


def seed_demo_decisions() -> None:
    """Carga la serie de demostración. Datos inventados, no observaciones."""
    with cursor() as cur:
        cur.executemany(
            "INSERT INTO change_proposals "
            "(id, project_id, meeting_id, iteration, operation, target_id, previous_content, "
            " content, source_turn_ids, rationale, signals, known_defective) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
            [
                (pid, PROJECT, mid, it, op, target, previous, content, turns,
                 rationale, json.dumps([]), defective)
                for pid, it, mid, op, target, previous, content, turns, rationale, defective
                in DEMO_PROPOSALS
            ],
        )
        now = datetime.now(timezone.utc)
        cur.executemany(
            "INSERT INTO review_decisions "
            "(proposal_id, participant_id, action, presented_at, decided_at) "
            "VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
            [
                (pid, "p-analista-01", action, now - timedelta(seconds=secs), now)
                for pid, action, secs in DEMO_DECISIONS
            ],
        )


def reset() -> None:
    """Vacía el fixture.

    TRUNCATE en lugar de DELETE: los triggers de inmutabilidad bloquean el
    borrado fila por fila, a propósito. Esta es la única vía de reinicio, y
    solo debe usarse sobre una base de prueba.
    """
    with cursor() as cur:
        cur.execute(
            "TRUNCATE review_decisions, change_proposals, requirement_revisions, "
            "llm_calls, turns, meetings, projects, participants RESTART IDENTITY CASCADE"
        )


def seed() -> None:
    with cursor() as cur:
        cur.execute(
            "INSERT INTO participants (id, display_name, role) VALUES (%s, %s, %s) "
            "ON CONFLICT (id) DO NOTHING",
            ("p-analista-01", "Analista", "analista"),
        )
        cur.execute(
            "INSERT INTO projects (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING",
            (PROJECT, "Clínica Norte"),
        )
        for meeting_id, iteration, label, held_at, mode in MEETINGS:
            cur.execute(
                "INSERT INTO meetings (id, project_id, iteration, label, held_at, consent_at, mode) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING",
                (meeting_id, PROJECT, iteration, label, held_at, held_at, mode),
            )
        cur.executemany(
            "INSERT INTO turns (meeting_id, turn_id, speaker, starts_at, text) "
            "VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
            TURNS + TURNS_D1,
        )
        cur.executemany(
            "INSERT INTO change_proposals "
            "(id, project_id, meeting_id, iteration, operation, target_id, "
            " content, source_turn_ids, rationale, signals, theme) "
            "VALUES (%s, %s, %s, 1, %s, %s, %s, %s, %s, %s, %s) "
            "ON CONFLICT DO NOTHING",
            [
                (pid, PROJECT, "m-2026-08-20", op, target, content, turns,
                 rationale, json.dumps(signals), theme)
                for pid, op, target, content, turns, rationale, signals, theme
                in CANDIDATES_D1
            ],
        )
        cur.executemany(
            "INSERT INTO requirement_revisions "
            "(project_id, requirement_id, revision, meeting_id, operation, content, source_turn_ids, summary) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
            [
                (PROJECT, rid, rev, mid, op, content, turns, summary)
                for rid, rev, mid, op, content, turns, summary in REVISIONS
            ],
        )
        cur.executemany(
            "INSERT INTO change_proposals "
            "(id, project_id, meeting_id, iteration, operation, target_id, previous_content, "
            " content, source_turn_ids, rationale, signals, theme, known_defective) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
            [
                (
                    pid, PROJECT, "m-2026-09-17", 3, op, target, previous,
                    content, turns, rationale, json.dumps(signals), theme, defective,
                )
                for pid, op, target, previous, content, turns, rationale, signals, theme, defective
                in PROPOSALS
            ],
        )


if __name__ == "__main__":
    try:
        if "--reset" in sys.argv:
            reset()
            print("fixture vaciado")
        seed()
        print(f"fixture cargado: {PROJECT}")
        if "--with-decisions" in sys.argv:
            seed_demo_decisions()
            print("serie de demostración cargada (datos inventados, no observaciones)")
    finally:
        # Python 3.14 no permite unir hilos durante la finalización del
        # intérprete: el pool tiene que cerrarse antes de salir.
        close_pool()
