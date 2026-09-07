"""Inyección controlada de propuestas defectuosas.

El estudio mide si el revisor detecta cuándo el agente se equivoca. Con
propuestas observadas eso no se puede medir: si el revisor acepta todo, no
hay forma de distinguir que el agente estuvo bien de que el revisor no estaba
mirando. Hacen falta defectos plantados, y saber cuáles son.

Los defectos se derivan de propuestas reales en lugar de escribirse de cero.
Una propuesta inventada suena distinta —otro vocabulario, otro registro— y el
revisor la detecta por el estilo antes que por el contenido; ahí se estaría
midiendo la costura, no la vigilancia.

Las transformaciones son deterministas y sin modelo: la misma semilla produce
la misma inyección, que es lo que permite repetir una corrida.
"""

from __future__ import annotations

import random
import re
from dataclasses import dataclass, replace
from typing import Literal, Sequence

from .entities import ChangeProposal

DefectKind = Literal[
    "clause_collapse", "citation_drift", "invented_precision", "role_shift"
]

#: Forma de historia de usuario. Los cuatro defectos operan sobre sus partes,
#: así que una propuesta que no encaje se saltea en lugar de mutilarse.
#:
#: La acción es codiciosa a propósito: los requisitos reales traen «para»
#: adentro de la acción —«semaforización (rojo para nivel 1…)»— y una
#: expresión no codiciosa cortaba en el primero, partiendo la oración al medio
#: e insertando el defecto dentro de un paréntesis. El «para» de la historia
#: es el último, no el primero.
STORY = re.compile(
    r"^Como\s+(?P<rol>.+?)\s+quiero\s+(?P<accion>.+)[,]?\s+para\s+(?P<fin>.+?)\.?$",
    re.IGNORECASE | re.DOTALL,
)

#: Precisiones que suenan razonables y que nadie dijo. El defecto no es que
#: sean absurdas: es que no están en la transcripción.
PRECISIONS = (
    "en un plazo máximo de 48 horas",
    "con un tope de tres intentos por sesión",
    "durante los primeros 15 días de cada mes",
    "conservando el historial de los últimos 12 meses",
)


#: Qué acción demuestra haber advertido cada tipo de defecto.
#:
#: No toda acción distinta de aceptar equivale a detección. En la cita
#: desplazada el texto del requisito es correcto y lo falso es la evidencia:
#: editar la redacción mejora el enunciado y deja la cita intacta, así que una
#: edición no demuestra que el revisor haya contrastado el turno. Observado en
#: la primera corrida con dos revisores, donde ambos editaron una cita
#: desplazada sin tocarla — contadas como detecciones, la tasa habría sido del
#: 100% para un defecto que ninguno advirtió.
#:
#: En los otros tres el defecto está en el texto, así que editarlo lo corrige.
DETECTED_BY: dict[str, frozenset[str]] = {
    "citation_drift": frozenset({"reject"}),
    "invented_precision": frozenset({"edit", "reject"}),
    "role_shift": frozenset({"edit", "reject"}),
    "clause_collapse": frozenset({"edit", "reject"}),
}


def detected(defect_kind: str | None, action: str) -> bool:
    """Si esa acción demuestra haber advertido ese defecto.

    Una propuesta sin defecto sembrado no se detecta ni se deja pasar: la
    pregunta no le aplica.
    """
    if defect_kind is None:
        return False
    return action in DETECTED_BY.get(defect_kind, frozenset({"edit", "reject"}))


@dataclass(frozen=True, slots=True)
class Injected:
    proposal: ChangeProposal
    kind: DefectKind
    #: Qué se alteró, en una oración. Va a la base junto a la propuesta: sin
    #: esto, el análisis posterior sabe que algo estaba mal pero no en qué.
    note: str


@dataclass(frozen=True, slots=True)
class Story:
    role: str
    action: str
    benefit: str


def parse(content: str | None) -> Story | None:
    """Parte la historia y limpia los bordes.

    La acción es codiciosa, así que se lleva la coma que la separa del «para».
    Sin recortarla, rearmar la oración dejaba dos comas seguidas y el defecto
    se delataba por la puntuación en vez de por lo que dice.
    """
    if not content:
        return None
    m = STORY.match(content.strip())
    if not m:
        return None
    return Story(
        role=m["rol"].strip().rstrip(","),
        action=m["accion"].strip().rstrip(","),
        benefit=m["fin"].strip().rstrip("."),
    )


def clause_collapse(a: ChangeProposal, b: ChangeProposal) -> Injected | None:
    """Mete la obligación de otra propuesta dentro de esta.

    Es el defecto que el estudio persigue: un requisito que acumula
    responsabilidades en lugar de partirse. Queda plausible porque las dos
    mitades son cosas que el cliente efectivamente pidió.
    """
    ma, mb = parse(a.content), parse(b.content)
    if not ma or not mb:
        return None

    texto = f"Como {ma.role} quiero {ma.action} y {mb.action}, para {ma.benefit}."
    return Injected(
        proposal=replace(a, content=texto),
        kind="clause_collapse",
        note=f"Absorbe la obligación de {b.target_id} en lugar de dejarla aparte.",
    )


def citation_drift(a: ChangeProposal, pool: Sequence[int], rng: random.Random) -> Injected | None:
    """Deja el texto y cambia los turnos citados por otros que no lo sostienen.

    El texto sigue siendo correcto: lo falso es la evidencia. Solo se detecta
    abriendo el contexto y leyendo, que es justamente la conducta que el
    estudio quiere poder distinguir de confiar por defecto.
    """
    ajenos = [t for t in pool if t not in a.source_turn_ids]
    if len(ajenos) < len(a.source_turn_ids):
        return None

    otros = sorted(rng.sample(ajenos, len(a.source_turn_ids)))
    return Injected(
        proposal=replace(a, source_turn_ids=otros),
        kind="citation_drift",
        note=f"Cita los turnos {otros} en lugar de {a.source_turn_ids}, que son los que la sostienen.",
    )


def invented_precision(a: ChangeProposal, rng: random.Random) -> Injected | None:
    """Agrega un número concreto que nadie dijo.

    Es el error más difícil de ver: la propuesta queda más completa y más
    profesional que la correcta. Detectarlo exige recordar que ese dato no
    apareció en la reunión.
    """
    m = parse(a.content)
    if not m:
        return None

    precision = rng.choice(PRECISIONS)
    texto = f"Como {m.role} quiero {m.action} {precision}, para {m.benefit}."
    return Injected(
        proposal=replace(a, content=texto),
        kind="invented_precision",
        note=f"Agrega «{precision}», que no aparece en la transcripción.",
    )


def role_shift(a: ChangeProposal, roles: Sequence[str], rng: random.Random) -> Injected | None:
    """Le atribuye la necesidad a otro rol de la misma reunión.

    Plausible porque el rol sustituto también participa del proceso. Falso
    porque quien lo pidió fue otro, y eso cambia a quién le sirve el sistema.
    """
    m = parse(a.content)
    if not m:
        return None

    otros = [r for r in roles if r.lower() != m.role.lower()]
    if not otros:
        return None

    nuevo = rng.choice(otros)
    texto = f"Como {nuevo} quiero {m.action}, para {m.benefit}."
    return Injected(
        proposal=replace(a, content=texto),
        kind="role_shift",
        note=f"Atribuye la necesidad a «{nuevo}» cuando la declaró «{m.role}».",
    )
