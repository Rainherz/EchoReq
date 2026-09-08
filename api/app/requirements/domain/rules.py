"""Reglas de calidad basadas en texto.

Deterministas y sin modelo: se pueden recalcular sobre las doce revisiones
sin costo ni variabilidad. Cubren la mitad sintáctica y pragmática del marco
QUS; la mitad semántica requiere juicio humano y se muestrea aparte.
"""

from __future__ import annotations

import re

#: Umbral a partir del cual un requisito deja de ser estimable.
ATOMIC_LIMIT = 2

_CLAUSE_MARKERS = (
    r",\s*excepto\b",
    r",\s*en cuyo caso\b",
    r",\s*salvo\b",
    r"\sy debe\b",
    r",\s*distinguiendo\b",
)

_USER_STORY = re.compile(
    r"^como\s+.+?\s+quiero\s+.+?(,\s*para\s+.+)?\.?$",
    re.IGNORECASE | re.DOTALL,
)

#: La acción pedida: lo que va entre «quiero» y el «para» del beneficio. El
#: beneficio queda afuera a propósito —«para mantener el padrón» describe por
#: qué se pide, no una obligación más.
_WANT_CLAUSE = re.compile(
    r"\bquiero\s+(.+?)(?:,\s*para\b|$)", re.IGNORECASE | re.DOTALL
)

#: Cabeza de acción: un infinitivo («registrar»), o una subordinada impersonal
#: («que se bloquee», «que el sistema notifique»), que es como el español
#: expresa una obligación sin nombrar al ejecutor.
_ACTION_HEAD = re.compile(
    r"^(?:que\s+(?:se\b|el\s+sistema\b)|\w+(?:ar|er|ir)\b)", re.IGNORECASE
)


def count_actions(text: str) -> int:
    """Acciones coordinadas dentro de la cláusula «quiero …».

    «registrar, editar y dar de baja» son tres obligaciones, no una. Es la
    violación canónica de atomicidad en QUS y la que más aparece cuando un
    requisito acumula alcance reunión a reunión.

    El corte por comas también parte las enumeraciones de campos, así que se
    cuenta sólo el tramo inicial: los verbos coordinados van juntos a la
    cabeza de la cláusula, y la lista de campos viene después. Al primer
    fragmento que no es una acción se corta.

    Contarlos sueltos por todo el texto no alcanza, porque el español tiene
    sustantivos que terminan como un infinitivo: en «DNI, nombre, correo,
    celular y permisos», la palabra «celular» pasaría por verbo y sumaría una
    responsabilidad que nadie pidió.
    """
    clause = _WANT_CLAUSE.search(text)
    if clause is None:
        return 0
    actions = 0
    for fragment in re.split(r",|\sy\s", clause.group(1)):
        if not _ACTION_HEAD.match(fragment.strip()):
            break
        actions += 1
    return actions


def estimate_responsibilities(text: str) -> int:
    """Cuenta obligaciones distintas empaquetadas en un requisito.

    Tres sumandos: oraciones, los marcadores de subordinada que el español
    usa para colgar comportamiento extra, y las acciones coordinadas de más
    dentro de la cláusula «quiero …».

    El tercero no estaba y dejaba la métrica ciega. Contra requisitos reales
    en español —historias de una sola oración, sin ninguno de los marcadores—
    la cuenta daba uno siempre, por construcción: un requisito con tres
    verbos y once campos puntuaba igual que uno atómico. La línea plana de H1
    no decía que el documento fuera atómico, decía que el instrumento no veía.

    De las acciones se descuenta una: la primera ya está contada como la
    oración que la contiene. Sumarlas todas contaría dos veces la misma.

    Sigue siendo una heurística. Ve acciones coordinadas; no ve la
    responsabilidad múltiple semántica —«gestionar el padrón» es un CRUD
    entero detrás de un verbo— y ninguna regla de texto la va a ver.
    """
    sentences = len([part for part in re.split(r"(?<=\.)\s+", text.strip()) if part])
    extra = sum(len(re.findall(marker, text, re.IGNORECASE)) for marker in _CLAUSE_MARKERS)
    actions = count_actions(text)
    return sentences + extra + max(0, actions - 1)


def is_well_formed(text: str) -> bool:
    """Verifica la plantilla ``Como <rol> quiero <acción> [para <beneficio>]``."""
    return bool(_USER_STORY.match(text.strip()))


def is_minimal(text: str) -> bool:
    """Una sola oración, sin notas ni cláusulas colgadas al final."""
    return estimate_responsibilities(text) == 1


def check(text: str) -> list[dict[str, str]]:
    """Señales de calidad para un requisito.

    Advertencias, nunca bloqueos: una regla que corrige sola mide la regla y
    no al revisor.
    """
    signals: list[dict[str, str]] = []

    responsibilities = estimate_responsibilities(text)
    if responsibilities > ATOMIC_LIMIT:
        signals.append(
            {
                "rule": "atomicity",
                "label": "Atomicidad",
                "detail": (
                    f"El requisito cubre {responsibilities} responsabilidades. "
                    "Puede convenir dividirlo."
                ),
            }
        )

    if not is_minimal(text) and responsibilities <= ATOMIC_LIMIT:
        signals.append(
            {
                "rule": "minimal",
                "label": "Minimalidad",
                "detail": "El texto excede una oración y acumula cláusulas condicionales.",
            }
        )

    if text.strip().lower().startswith("como ") and not is_well_formed(text):
        signals.append(
            {
                "rule": "well-formed",
                "label": "Formato",
                "detail": "No respeta la plantilla «Como <rol> quiero <acción> para <beneficio>».",
            }
        )

    return signals


#: El rol de la historia: lo que va entre «como» y «quiero».
_ROLE_CLAUSE = re.compile(r"^como\s+(.+?)\s+quiero\b", re.IGNORECASE | re.DOTALL)

#: Artículos y determinantes que a veces se cuelan delante del rol y lo
#: convertirían en un actor distinto: «un directivo» y «directivo» son el
#: mismo, y contarlos aparte parte la trazabilidad en dos filas.
_LEADING = re.compile(r"^(?:el|la|los|las|un|una|unos|unas)\s+", re.IGNORECASE)


def extract_actors(text: str) -> tuple[str, ...]:
    """Los actores nombrados en el rol de la historia.

    Una historia de usuario tiene un rol. «Como especialista o directivo
    quiero X» nombra dos, y eso no es un detalle de redacción: o son dos
    historias, o es un rol sobregeneralizado que nadie definió. Devolver los
    dos por separado es lo que deja verlo.

    Devuelve el texto tal como está escrito, sólo sin el artículo de adelante
    —«un directivo» y «directivo» son el mismo— y con los espacios
    normalizados. No pasa a minúscula: «especialista de la UGEL» quedaría
    «especialista de la ugel», y una sigla rota en pantalla es un actor que
    nadie reconoce. Agrupar sin distinguir mayúsculas es tarea de quien
    consume, que ahí sí puede mostrar la forma original.

    Decidir que «especialista» y «especialista de la UGEL» son la misma
    persona es juicio de dominio, no de texto: la herramienta los pone al
    lado para que alguien lo decida, y el arreglo va en el requisito, no en
    un diccionario de alias que dejaría el documento diciendo lo que no
    quiere decir.
    """
    clause = _ROLE_CLAUSE.match(text.strip())
    if clause is None:
        return ()
    role = re.sub(r"\s+", " ", clause.group(1)).strip()
    partes = [p.strip(" ,") for p in re.split(r"\s+(?:o|y)\s+", role)]
    limpias = [_LEADING.sub("", p) for p in partes if p.strip(" ,")]
    # Conserva el orden y saca repetidos, sin distinguir mayúsculas: «como
    # Directivo o directivo» es uno solo, y se muestra como vino el primero.
    vistos: dict[str, str] = {}
    for actor in limpias:
        vistos.setdefault(actor.lower(), actor)
    return tuple(vistos.values())
