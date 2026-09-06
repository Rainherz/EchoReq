-- Qué clase de defecto se inyectó.
--
-- `known_defective` dice que la propuesta está mal a sabiendas; esta columna
-- dice en qué. Sin ella el estudio reporta una tasa de detección sola, que
-- esconde lo interesante: no es lo mismo dejar pasar una cita movida —basta
-- con abrir el contexto y leer— que una precisión inventada, que exige
-- recordar que ese número nunca se dijo.
--
-- Poder desagregar convierte «detectó el 62%» en «detectó el 80% de las citas
-- movidas y el 40% de las precisiones inventadas», que es un hallazgo y no un
-- número.

ALTER TABLE change_proposals
    ADD COLUMN defect_kind TEXT
        CHECK (defect_kind IS NULL OR defect_kind IN (
            'clause_collapse',    -- dos obligaciones en un requisito
            'citation_drift',     -- cita turnos que no dicen lo que afirma
            'invented_precision', -- agrega un número que nadie dijo
            'role_shift'          -- le atribuye la necesidad a otro rol
        )),
    ADD COLUMN defect_note TEXT;

-- El fixture ya traía una propuesta marcada sin decir en qué consistía el
-- defecto: colapsa el reembolso dentro de R-02, que es una obligación
-- distinta y merecía su propio requisito.
UPDATE change_proposals
SET defect_kind = 'clause_collapse',
    defect_note = 'Mete el reembolso dentro de R-02 en lugar de proponerlo aparte.'
WHERE known_defective AND defect_kind IS NULL;

-- Una propuesta defectuosa declara en qué lo es; una correcta no declara
-- defecto. Las dos mitades se hacen cumplir juntas, para que nadie pueda
-- marcar algo como defectuoso sin dejar dicho por qué.
ALTER TABLE change_proposals
    ADD CONSTRAINT change_proposals_defect_declared CHECK (
        (known_defective AND defect_kind IS NOT NULL)
        OR (NOT known_defective AND defect_kind IS NULL)
    );
