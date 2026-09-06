-- El rol y el nombre, separados.
--
-- Estaban en un solo campo libre, y eso dejaba la frontera de privacidad a
-- cargo de la disciplina de quien escribe: alcanzaba con teclear «Cristian
-- Salwa, especialista» para meter un nombre propio en cada prompt y en cada
-- exportación de la tesis.
--
-- Son dos datos con destinos distintos. El rol es lo que el agente necesita
-- para distinguir quién pide de quién pregunta, y lo que se analiza después;
-- viaja al modelo y a los CSV. El nombre existe solo para que el analista
-- sepa a quién escuchó, y no sale de la base.
--
-- Separarlos convierte esa frontera en estructura y no en una recomendación.

ALTER TABLE speaker_labels RENAME COLUMN label TO role;

ALTER TABLE speaker_labels
    ADD COLUMN name TEXT
        CHECK (name IS NULL OR length(btrim(name)) > 0);

ALTER TABLE speaker_labels RENAME CONSTRAINT speaker_labels_label_check
    TO speaker_labels_role_check;
