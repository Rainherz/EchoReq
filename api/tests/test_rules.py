"""Casos del corpus real de UGEL Lampa.

No son ejemplos inventados: son los requisitos vigentes del proyecto, con el
número que un lector humano les asigna. La métrica anterior daba uno a todos
—incluido el de tres verbos y once campos— y la curva plana de H1 se leía
como un documento atómico cuando era el instrumento el que no veía.

La mitad que no puede romperse importa tanto como la que había que arreglar:
un estimador que empieza a ver responsabilidades donde no las hay deja H1
igual de ciego, sólo que hacia el otro lado.
"""

from __future__ import annotations

import pytest

from app.requirements.domain.rules import (
    ATOMIC_LIMIT,
    count_actions,
    estimate_responsibilities,
    is_minimal,
)

# --- lo que hay que ver -------------------------------------------------

ACUMULADOS = [
    pytest.param(
        "Como jefe de gestión o especialista coordinador quiero registrar, "
        "editar y dar de baja instituciones educativas ingresando su código "
        "modular, código de local escolar, nombre, nivel o niveles "
        "educativos, tipo de gestión, ubicación geográfica y director "
        "asignado, para mantener el padrón institucional actualizado.",
        3,
        id="R-17 · tres verbos y siete campos",
    ),
    pytest.param(
        "Como directivo o subdirector quiero registrar, actualizar y dar de "
        "baja a los docentes de mi institución educativa con sus datos "
        "personales, de contacto y escala magisterial (de la primera a la "
        "octava) en un plazo máximo de 48 horas, para mantener al día el "
        "padrón de la plana docente.",
        3,
        id="R-09 · tres verbos",
    ),
    pytest.param(
        "Como responsable de seguridad del sistema quiero que se bloquee "
        "temporalmente el acceso tras tres intentos fallidos de inicio de "
        "sesión y que se impida el uso simultáneo de una misma cuenta "
        "alertando al segundo usuario, para proteger las credenciales frente "
        "a accesos no autorizados.",
        2,
        id="R-15 · dos subordinadas impersonales, sin infinitivo",
    ),
]

# --- lo que no puede romperse -------------------------------------------

ATOMICOS = [
    pytest.param(
        "Como docente evaluado o directivo quiero recibir automáticamente por "
        "correo electrónico una copia del reporte de la ficha de monitoreo "
        "completada, para tener constancia inmediata de los puntajes y "
        "observaciones.",
        id="R-05 · una acción, con «y» en el beneficio",
    ),
    pytest.param(
        "Como usuario del sistema quiero solicitar el restablecimiento de mi "
        "contraseña a través de mi correo electrónico registrado, para "
        "recuperar el acceso a mi cuenta en caso de extravío u olvido.",
        id="R-14 · una acción",
    ),
    pytest.param(
        "Como directivo o especialista quiero consultar el historial "
        "acumulado de monitoreos de un docente que ha sido reasignado o "
        "trasladado desde otra institución educativa de la jurisdicción, para "
        "conocer sus antecedentes pedagógicos.",
        id="R-10 · «que ha sido» es relativa, no una acción más",
    ),
    pytest.param(
        "Como especialista de la UGEL quiero visualizar un mapa "
        "georreferenciado con la ubicación precisa de las instituciones "
        "educativas mediante coordenadas de ESCALE o mapas interactivos y su "
        "estado de avance de monitoreo, para controlar el cumplimiento del "
        "cronograma de visitas anuales.",
        id="R-07 · la «y» coordina complementos, no verbos",
    ),
]


@pytest.mark.parametrize(("texto", "esperado"), ACUMULADOS)
def test_cuenta_las_acciones_coordinadas(texto: str, esperado: int) -> None:
    assert estimate_responsibilities(texto) == esperado


@pytest.mark.parametrize("texto", ATOMICOS)
def test_no_inventa_responsabilidades(texto: str) -> None:
    assert estimate_responsibilities(texto) == 1
    assert is_minimal(texto)


def test_la_enumeracion_de_campos_no_cuenta() -> None:
    """Once campos en una acción son tamaño, no atomicidad.

    Partir por comas sin exigir una cabeza de acción daría once. Son
    atributos distintos de QUS y mezclarlos ensucia lo que mide H1.
    """
    texto = (
        "Como jefe de gestión pedagógica quiero registrar, editar y "
        "administrar especialistas consignando su DNI, nombre, especialidad, "
        "nivel educativo asignado (Inicial, Primaria, Secundaria, EBA, EBE o "
        "CETPRO), correo, celular y permisos asignados (coordinador o "
        "monitor), para gestionar el equipo de monitoreo."
    )
    assert count_actions(texto) == 3
    assert estimate_responsibilities(texto) == 3


def test_el_beneficio_queda_afuera() -> None:
    """«para mantener el padrón» dice por qué se pide, no qué hay que hacer."""
    assert count_actions("Como X quiero listar Y, para revisar y auditar Z.") == 1


def test_un_texto_sin_plantilla_cae_en_las_oraciones() -> None:
    """Sin «quiero» no hay cláusula que partir: queda la cuenta de siempre."""
    assert count_actions("El sistema registra visitas.") == 0
    assert estimate_responsibilities("El sistema registra visitas.") == 1


def test_los_marcadores_de_subordinada_siguen_sumando() -> None:
    texto = "Como X quiero registrar la visita, salvo cuando no haya cupo."
    assert estimate_responsibilities(texto) > ATOMIC_LIMIT - 1
