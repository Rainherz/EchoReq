-- EchoReq · esquema del instrumento de medición
--
-- Regla transversal: las tablas que sostienen el estudio son de solo
-- anexado. No se actualiza ni se borra ningún registro. La inmutabilidad
-- se hace cumplir en la base, no por convención del código: un UPDATE
-- accidental sobre una decisión de revisión destruiría datos que no se
-- pueden reconstruir.

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------- estudio

CREATE TABLE participants (
    id           TEXT PRIMARY KEY,
    display_name TEXT        NOT NULL,
    role         TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE projects (
    id         TEXT PRIMARY KEY,
    name       TEXT        NOT NULL,
    -- Formato primario de la cadena medida. Los demás formatos existen en
    -- la aplicación pero quedan fuera del experimento: mezclarlos haría
    -- incomparables las curvas de deriva.
    format     TEXT        NOT NULL DEFAULT 'user-story',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE meetings (
    id          TEXT PRIMARY KEY,
    project_id  TEXT        NOT NULL REFERENCES projects (id),
    iteration   INTEGER     NOT NULL CHECK (iteration >= 1),
    label       TEXT        NOT NULL,
    held_at     TIMESTAMPTZ NOT NULL,
    -- Sin consentimiento registrado no se procesa la sesión.
    consent_at  TIMESTAMPTZ,
    mode        TEXT        NOT NULL CHECK (mode IN ('discovery', 'living')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, iteration)
);

-- --------------------------------------------------------- transcripción

-- El turno es la unidad de cita de todo el sistema. Sin identificador
-- estable no hay trazabilidad posible.
CREATE TABLE turns (
    meeting_id TEXT    NOT NULL REFERENCES meetings (id),
    turn_id    INTEGER NOT NULL,
    speaker    TEXT    NOT NULL,
    starts_at  TEXT    NOT NULL,
    ends_at    TEXT,
    text       TEXT    NOT NULL,
    PRIMARY KEY (meeting_id, turn_id)
);

CREATE INDEX turns_meeting_idx ON turns (meeting_id);

-- ------------------------------------------------------------- documento

CREATE TABLE requirement_revisions (
    id             BIGSERIAL PRIMARY KEY,
    project_id     TEXT        NOT NULL REFERENCES projects (id),
    requirement_id TEXT        NOT NULL,
    revision       INTEGER     NOT NULL CHECK (revision >= 1),
    meeting_id     TEXT        NOT NULL REFERENCES meetings (id),
    operation      TEXT        NOT NULL
        CHECK (operation IN ('create', 'modify', 'delete', 'conflict')),
    content        TEXT        NOT NULL,
    source_turn_ids INTEGER[]  NOT NULL,
    summary        TEXT        NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, requirement_id, revision)
);

CREATE INDEX requirement_revisions_lookup_idx
    ON requirement_revisions (project_id, revision);

-- ------------------------------------------------------------ propuestas

CREATE TABLE change_proposals (
    id              TEXT PRIMARY KEY,
    project_id      TEXT        NOT NULL REFERENCES projects (id),
    meeting_id      TEXT        NOT NULL REFERENCES meetings (id),
    iteration       INTEGER     NOT NULL CHECK (iteration >= 1),
    operation       TEXT        NOT NULL
        CHECK (operation IN ('create', 'modify', 'delete', 'conflict')),
    target_id       TEXT        NOT NULL,
    previous_content TEXT,
    content         TEXT,
    -- Cita obligatoria. Una propuesta que no puede señalar la transcripción
    -- se descarta antes de llegar a la pantalla de revisión: es la defensa
    -- estructural contra la alucinación.
    source_turn_ids INTEGER[]   NOT NULL CHECK (cardinality(source_turn_ids) > 0),
    rationale       TEXT        NOT NULL DEFAULT '',
    signals         JSONB       NOT NULL DEFAULT '[]'::jsonb,
    theme           TEXT,
    -- Marca de la referencia del guion de inyección: si el equipo sabe que
    -- esta propuesta es incorrecta, se anota acá para poder medir cuántas
    -- defectuosas se aprobaron sin editar.
    known_defective BOOLEAN     NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX change_proposals_iteration_idx
    ON change_proposals (project_id, iteration);

-- --------------------------------------------------------- la medición

-- Origen de datos de H2 y H3. presented_at y decided_at se capturan en el
-- momento y no se reconstruyen después: una iteración revisada sin ellos
-- no se puede recuperar.
CREATE TABLE review_decisions (
    id             BIGSERIAL PRIMARY KEY,
    proposal_id    TEXT        NOT NULL REFERENCES change_proposals (id),
    participant_id TEXT        NOT NULL REFERENCES participants (id),
    action         TEXT        NOT NULL CHECK (action IN ('accept', 'edit', 'reject')),
    presented_at   TIMESTAMPTZ NOT NULL,
    decided_at     TIMESTAMPTZ NOT NULL,
    edited_content TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (decided_at >= presented_at),
    -- Una propuesta se decide una sola vez por participante.
    UNIQUE (proposal_id, participant_id)
);

CREATE INDEX review_decisions_proposal_idx ON review_decisions (proposal_id);

CREATE VIEW review_timings AS
SELECT
    d.id,
    p.project_id,
    p.iteration,
    d.proposal_id,
    d.participant_id,
    d.action,
    p.known_defective,
    EXTRACT(EPOCH FROM (d.decided_at - d.presented_at)) AS seconds
FROM review_decisions d
JOIN change_proposals p ON p.id = d.proposal_id;

-- ------------------------------------------------------ auditoría y replay

-- Registro íntegro de cada llamada al modelo. Habilita el adaptador de
-- reproducción: la fase de análisis re-ejecuta una cadena completa desde
-- acá, sin costo y con resultado idéntico.
CREATE TABLE llm_calls (
    id           BIGSERIAL PRIMARY KEY,
    project_id   TEXT        NOT NULL REFERENCES projects (id),
    meeting_id   TEXT        NOT NULL REFERENCES meetings (id),
    iteration    INTEGER     NOT NULL,
    stage        TEXT        NOT NULL,
    model_id     TEXT        NOT NULL,
    params       JSONB       NOT NULL DEFAULT '{}'::jsonb,
    prompt       TEXT        NOT NULL,
    response     TEXT        NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX llm_calls_replay_idx ON llm_calls (project_id, iteration, stage);

-- ------------------------------------------- inmutabilidad, hecha cumplir

CREATE OR REPLACE FUNCTION reject_mutation() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION
        'La tabla % es de solo anexado: % no está permitido. Corregí anexando una revisión nueva.',
        TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER requirement_revisions_immutable
    BEFORE UPDATE OR DELETE ON requirement_revisions
    FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE TRIGGER review_decisions_immutable
    BEFORE UPDATE OR DELETE ON review_decisions
    FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE TRIGGER llm_calls_immutable
    BEFORE UPDATE OR DELETE ON llm_calls
    FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE TRIGGER turns_immutable
    BEFORE UPDATE OR DELETE ON turns
    FOR EACH ROW EXECUTE FUNCTION reject_mutation();
