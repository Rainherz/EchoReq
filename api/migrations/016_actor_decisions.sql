-- Qué se decidió sobre cada nombre de actor que aparece en el documento.
--
-- Tres salidas, y las tres contestan la misma pregunta —«qué representa este
-- nombre»— para que sean comparables entre sí:
--
--   same   es el mismo rol que uno ya declarado, escrito distinto
--   new    es un rol propio que faltaba declarar
--   wrong  el requisito nombra al actor equivocado
--
-- `same` y `wrong` producen un pendiente parecido pero no son lo mismo:
-- «especialista de la UGEL» sí es un especialista y el problema es de
-- vocabulario; un requisito que nombra a quien no corresponde tiene un
-- problema de contenido. Colapsarlas perdería esa diferencia justo donde
-- importa, que es al aplicar el arreglo.
--
-- Decidir no arregla nada. El texto del requisito sigue diciendo lo que
-- decía —el log es inmutable y las revisiones ya medidas no se reescriben—,
-- así que cada decisión deja un pendiente que se aplica al revisar una
-- reunión futura. Por eso no hay estado «resuelto»: hay «decidido».
--
-- Es configuración del proyecto, no dato del estudio: se corrige y se borra.

CREATE TABLE actor_decisions (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    -- El nombre tal como aparece escrito en los requisitos.
    observed   TEXT NOT NULL,
    outcome    TEXT NOT NULL CHECK (outcome IN ('same', 'new', 'wrong')),
    -- El rol que rige. Nulo no tiene sentido para `same`; para `wrong` puede
    -- faltar si todavía no se sabe cuál corresponde.
    role       TEXT,
    note       TEXT NOT NULL DEFAULT '',
    decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT actor_decisions_same_needs_role
        CHECK (outcome <> 'same' OR role IS NOT NULL)
);

CREATE UNIQUE INDEX actor_decisions_observed
    ON actor_decisions (project_id, lower(observed));
