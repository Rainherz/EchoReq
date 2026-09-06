-- Quién es cada voz, según el analista.
--
-- Va aparte de `turns` porque son dos afirmaciones distintas y de distinto
-- origen. Que la voz de un tramo sea la 00 lo dice el modelo de diarización:
-- es una observación, y por eso `turns` es de solo anexado. Que esa voz sea
-- la del especialista de la UGEL lo dice una persona mirando el audio: es una
-- interpretación, puede estar equivocada y tiene que poder corregirse sin
-- tocar el registro de lo que el modelo observó.
--
-- La etiqueta entra en el prompt de generación. Sin ella el agente lee `S1` y
-- `S2` y no puede distinguir un requisito que el cliente pidió de una idea
-- que el entrevistador metió en la conversación.
--
-- Conviene el rol antes que el nombre propio: le da al agente el mismo
-- contexto sin convertir la transcripción en datos identificados de las
-- personas entrevistadas.

CREATE TABLE speaker_labels (
    meeting_id TEXT        NOT NULL REFERENCES meetings (id),
    code       TEXT        NOT NULL,
    label      TEXT        NOT NULL CHECK (length(btrim(label)) > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (meeting_id, code)
);
