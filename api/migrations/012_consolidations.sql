-- Qué versión queda en la especificación cuando los revisores difieren.
--
-- Consolidar no es revisar. Revisar es decidir a ciegas sobre lo que propuso
-- el agente, y eso es lo que el estudio mide. Consolidar ocurre después, a la
-- vista del desacuerdo, y resuelve cuál de las versiones humanas queda: es
-- arbitraje entre personas, no detección de errores del modelo.
--
-- Por eso va en su propia tabla y no pisa `review_decisions`. La decisión de
-- cada revisor queda intacta —es el dato— y encima se apoya una capa que dice
-- cuál se adoptó, quién lo resolvió y por qué. Es la misma separación que
-- entre lo que observó el modelo y lo que interpretó una persona.
--
-- Se puede corregir: a diferencia de una decisión, una consolidación es una
-- postura del equipo sobre su propio documento y puede revisarse en la
-- reunión siguiente.

CREATE TABLE consolidations (
    proposal_id  TEXT        NOT NULL REFERENCES change_proposals (id),
    -- De quién se adopta la versión. Referencia a un revisor que decidió esa
    -- propuesta: no se puede adoptar el texto de alguien que no la miró.
    chosen_from  TEXT        NOT NULL REFERENCES participants (id),
    -- Quién resolvió. Puede ser otro: el que arbitra no tiene por qué haber
    -- revisado.
    resolved_by  TEXT        NOT NULL REFERENCES participants (id),
    reason       TEXT        NOT NULL CHECK (length(btrim(reason)) > 0),
    resolved_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (proposal_id)
);

CREATE INDEX consolidations_chosen_idx ON consolidations (chosen_from);
