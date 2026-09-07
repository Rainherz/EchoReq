-- Las tres salidas posibles de un desacuerdo.
--
-- Adoptar la versión de alguien es sólo una. Un equipo también puede concluir
-- que el requisito no va —ninguna redacción lo arregla porque el problema es
-- que no corresponde— o que ninguna de las dos sirve y hay que escribir otra.
--
-- Forzar esos dos casos dentro de «adoptar» obligaría a elegir la versión
-- menos mala y dejaría el documento diciendo algo que nadie sostiene.

ALTER TABLE consolidations
    ADD COLUMN outcome TEXT NOT NULL DEFAULT 'adopt'
        CHECK (outcome IN (
            'adopt',    -- rige la versión de un revisor
            'drop',     -- el requisito no va: sale de la especificación
            'rewrite'   -- ninguna sirve: rige un texto del equipo
        )),
    ADD COLUMN content TEXT;

-- Cada salida necesita lo suyo y sólo lo suyo. Sin esto se podría guardar una
-- adopción sin decir de quién, o una reescritura sin texto.
ALTER TABLE consolidations
    ALTER COLUMN chosen_from DROP NOT NULL,
    ADD CONSTRAINT consolidations_outcome_complete CHECK (
        (outcome = 'adopt'   AND chosen_from IS NOT NULL AND content IS NULL)
     OR (outcome = 'drop'    AND chosen_from IS NULL     AND content IS NULL)
     OR (outcome = 'rewrite' AND chosen_from IS NULL     AND length(btrim(content)) > 0)
    );
