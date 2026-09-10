-- Criterios de aceptación, en formato BDD.
--
-- SWEBOK v4 §4.5 lista `acceptance criteria` entre los atributos de un
-- requisito, y §4.3 —«Acceptance Criteria-Based Requirements
-- Specification»— describe cómo escribirlos: escenarios en forma
-- «Given <some context> when <stimulus> then <outcome>». Las tres columnas
-- se llaman como el estándar las nombra, y de paso `when` y `then` son
-- palabras reservadas en SQL.
--
-- Viven aparte de la cola de propuestas a propósito. Si el agente los
-- propusiera junto con el texto, el revisor tendría más para leer en cada
-- decisión y las medianas de tiempo subirían por una razón que no es fatiga
-- —contaminando la serie que mide H2. Además §4.3 describe una reunión
-- aparte, anterior a diseño y construcción, no al analista escribiéndolos
-- mientras despacha una cola.
--
-- Dos salidas, porque la actividad tiene dos resultados honestos:
--
--   scenario  se pudo escribir el criterio
--   question  no se pudo sin volver a preguntarle a alguien
--
-- El segundo no es un hueco del registro: es el dato. SWEBOK pone la
-- ambigüedad como uno de los dos problemas primarios, y contar cuántos
-- requisitos no se pueden convertir en escenario sin preguntar es medirla.

CREATE TABLE acceptance_criteria (
    id              BIGSERIAL PRIMARY KEY,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    requirement_id  TEXT NOT NULL,

    -- La revisión del requisito contra la que se escribió. Si el requisito
    -- cambia después, el criterio queda desactualizado y hay que mirarlo de
    -- nuevo: un criterio que describe un texto que ya no existe miente en
    -- silencio, que es peor que faltar.
    written_against INTEGER NOT NULL,

    kind            TEXT NOT NULL CHECK (kind IN ('scenario', 'question')),

    -- Escenario: el nombre distingue un caso de otro cuando un requisito
    -- acumula varios —el camino feliz, el borde, la excepción.
    name            TEXT NOT NULL DEFAULT '',
    context         TEXT NOT NULL DEFAULT '',
    stimulus        TEXT NOT NULL DEFAULT '',
    outcome         TEXT NOT NULL DEFAULT '',

    -- Pregunta abierta: qué falta saber y a quién habría que preguntarle.
    question        TEXT NOT NULL DEFAULT '',
    ask_to          TEXT NOT NULL DEFAULT '',

    author          TEXT NOT NULL REFERENCES participants(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT acceptance_criteria_scenario_is_complete
        CHECK (
            kind <> 'scenario'
            OR (context <> '' AND stimulus <> '' AND outcome <> '')
        ),
    CONSTRAINT acceptance_criteria_question_has_text
        CHECK (kind <> 'question' OR question <> '')
);

CREATE INDEX acceptance_criteria_requirement_idx
    ON acceptance_criteria (project_id, requirement_id);
