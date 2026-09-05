-- Corrección de una decisión de revisión.
--
-- El problema: las decisiones son inmutables y no hay confirmación antes de
-- registrar una —agregarla sumaría tiempo a la medición—, así que un clic
-- accidental deja un dato contaminado que no se puede arreglar.
--
-- La corrección NO modifica ni borra la decisión original. Se anexa acá,
-- apuntando a ella. La decisión y su intervalo siguen exportándose, marcados:
-- el análisis decide si los excluye, y la tasa de corrección es en sí misma
-- una medida de confiabilidad del instrumento.
--
-- Tres frenos para que no funcione como un deshacer:
--   · el motivo es obligatorio;
--   · una decisión se corrige una sola vez;
--   · la aplicación solo ofrece corregir la decisión inmediatamente anterior,
--     así que no se puede reescribir la historia después de ver qué vino.

CREATE TABLE decision_corrections (
    id             BIGSERIAL PRIMARY KEY,
    decision_id    BIGINT      NOT NULL REFERENCES review_decisions (id),
    participant_id TEXT        NOT NULL REFERENCES participants (id),
    -- Qué había querido hacer en realidad.
    intended_action TEXT       NOT NULL
        CHECK (intended_action IN ('accept', 'edit', 'reject')),
    reason         TEXT        NOT NULL CHECK (length(btrim(reason)) >= 3),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Una decisión se corrige una vez. Corregir la corrección sería el
    -- deshacer que esto existe para no ser.
    UNIQUE (decision_id)
);

CREATE INDEX decision_corrections_decision_idx
    ON decision_corrections (decision_id);

CREATE TRIGGER decision_corrections_immutable
    BEFORE UPDATE OR DELETE ON decision_corrections
    FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- La vista de tiempos suma el estado de corrección para que el análisis pueda
-- filtrar sin volver a unir tablas.
CREATE OR REPLACE VIEW review_timings AS
SELECT
    d.id,
    p.project_id,
    p.iteration,
    d.proposal_id,
    d.participant_id,
    d.action,
    p.known_defective,
    EXTRACT(EPOCH FROM (d.decided_at - d.presented_at)) AS seconds,
    (c.id IS NOT NULL)      AS corrected,
    c.intended_action,
    c.reason                AS correction_reason
FROM review_decisions d
JOIN change_proposals p ON p.id = d.proposal_id
LEFT JOIN decision_corrections c ON c.decision_id = d.id;
