-- Huella de voz por hablante, para reconocerlo entre reuniones.
--
-- La diarización numera las voces por orden de aparición en cada audio, así
-- que el S2 de una reunión no es el S2 de la siguiente. Con diez reuniones y
-- cinco voces son cincuenta etiquetados a mano, y basta escribir
-- «Especialista» una vez y «especialista» otra para que el agente lea a la
-- misma persona como dos roles distintos, sin que nada lo delate.
--
-- pyannote devuelve un centroide por voz, ya reordenado para coincidir con
-- las etiquetas de la anotación. Guardarlo permite comparar una voz nueva
-- contra las conocidas del proyecto y proponer a quién se parece.
--
-- La propuesta es sólo eso: la confirma una persona. Quién habla decide si un
-- requisito lo pidió el cliente o lo sugirió el entrevistador, y eso entra al
-- prompt del agente. Una identificación automática equivocada contaminaría
-- esa señal sin dejar rastro, que es la misma razón por la que las etiquetas
-- viven aparte de los turnos.

CREATE TABLE speaker_voiceprints (
    meeting_id TEXT        NOT NULL REFERENCES meetings (id) ON DELETE CASCADE,
    code       TEXT        NOT NULL,
    embedding  vector      NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (meeting_id, code)
);

CREATE INDEX speaker_voiceprints_meeting_idx ON speaker_voiceprints (meeting_id);
