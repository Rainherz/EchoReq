"""Parser de transcripciones: .txt «Hablante: texto» y .vtt de Meet/Teams."""

import pytest

from app.requirements.domain.transcript_import import TranscriptError, kind_for, parse

TEAMS_VTT = """WEBVTT

a1b2/12-0
00:00:01.200 --> 00:00:04.900
<v Heidi Cordova>Buenas tardes, director.</v>

a1b2/13-0
00:00:05.000 --> 00:00:07.100
<v Heidi Cordova>¿Autoriza que grabemos?</v>

a1b2/14-0
00:00:07.500 --> 00:00:09.000
<v Juan Quispe (Director)>Sí, autorizo.</v>

a1b2/15-0
00:01:02.000 --> 00:01:09.000
<v Juan Quispe (Director)>Pasar todo del papel al Excel &amp; cuadrar horarios.</v>
"""

MEET_VTT = """WEBVTT

NOTE exportado de Google Meet

00:00:01.000 --> 00:00:03.000
Heidi Cordova: ¿Cuántos docentes tiene?

00:00:03.500 --> 00:00:06.000
Director UGEL: Son veintidós.
"""


def test_txt_basico_y_comentarios():
    turns = parse(
        "# comentario\nEntrevistador: Hola.\n[pausa 1]\nDirector: Buenas tardes.\n",
        "txt",
    )
    assert [(t.turn_id, t.speaker, t.text) for t in turns] == [
        (1, "Entrevistador", "Hola."),
        (2, "Director", "Buenas tardes."),
    ]
    assert turns[0].starts_at == ""  # sin marca no se inventa una


def test_txt_marca_de_tiempo_y_continuacion():
    turns = parse(
        "[00:12] Entrevistador: ¿Qué le toma más tiempo?\n"
        "[00:15] Director: Pasar todo al Excel,\n"
        "y además cuadrar horarios.\n"
        "[1:02:03] Entrevistador: Gracias.\n",
        "txt",
    )
    assert turns[0].starts_at == "00:12"
    assert turns[1].text == "Pasar todo al Excel, y además cuadrar horarios."
    assert turns[2].starts_at == "1:02:03"


def test_lineas_seguidas_del_mismo_hablante_son_un_turno():
    turns = parse("A: uno.\nA: dos.\nB: tres.\n", "txt")
    assert [t.text for t in turns] == ["uno. dos.", "tres."]


def test_una_frase_con_dos_puntos_no_es_hablante():
    turns = parse("A: hola.\nB: Y entonces el especialista me dijo: mandalo hoy.\n", "txt")
    assert turns[1].speaker == "B"


def test_txt_sin_hablante_al_inicio_falla():
    with pytest.raises(TranscriptError, match="Línea 2"):
        parse("## Sesión 1\n**1. Cargo**\n«Soy director»\n", "txt")


def test_vtt_teams_une_cues_y_limpia_entidades():
    turns = parse(TEAMS_VTT, "vtt")
    assert [(t.speaker, t.starts_at) for t in turns] == [
        ("Heidi Cordova", "00:01"),
        ("Juan Quispe (Director)", "00:07"),
    ]
    assert turns[0].text == "Buenas tardes, director. ¿Autoriza que grabemos?"
    assert turns[1].text.endswith("Excel & cuadrar horarios.")


def test_vtt_meet():
    turns = parse(MEET_VTT, "vtt")
    assert [t.speaker for t in turns] == ["Heidi Cordova", "Director UGEL"]


def test_vtt_sin_hablantes_falla():
    with pytest.raises(TranscriptError, match="no dicen quién habla"):
        parse("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhola\n\n00:00:03.000 --> 00:00:04.000\nchau\n", "vtt")


def test_menos_de_dos_turnos_falla():
    with pytest.raises(TranscriptError):
        parse("A: solo yo.\n", "txt")


def test_extension():
    assert kind_for("reunion.VTT") == "vtt"
    with pytest.raises(TranscriptError):
        kind_for("reunion.docx")
