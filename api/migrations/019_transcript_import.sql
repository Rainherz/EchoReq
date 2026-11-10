-- Transcripción importada de un archivo de texto.
--
-- Una reunión puede traer su transcripción ya hecha —el .vtt de Meet o
-- Teams, o un .txt «Hablante: texto»— en lugar del audio. Es la otra
-- entrada posible de la cadena, no una segunda: los turnos de una reunión
-- salen de una sola fuente. `turns` es de solo anexado y las decisiones los
-- citan por número, así que mezclar dos fuentes reasignaría esos números.
--
-- No se duplica lo que ya existe. El estado sigue siendo
-- `transcription_status` (003) y la procedencia `transcription_model` /
-- `transcribed_at` (005): una importación deja `transcription_model =
-- 'import'`, que dice la verdad —no pasó por ningún modelo— y cumple
-- `meetings_transcription_provenance`. Acá solo va lo que el archivo
-- necesita para verificarse, igual que el audio: dónde está, su nombre, su
-- hash y en qué formato vino.
--
-- Se puede correr sobre una base ya inicializada sin romper nada: las
-- columnas y las restricciones se agregan solo si faltan.

ALTER TABLE meetings
    ADD COLUMN IF NOT EXISTS transcript_filename TEXT,
    ADD COLUMN IF NOT EXISTS transcript_path     TEXT,
    ADD COLUMN IF NOT EXISTS transcript_sha256   TEXT,
    -- txt · una intervención por línea, «Hablante: texto»
    -- vtt · WebVTT de Meet, Teams o Zoom
    ADD COLUMN IF NOT EXISTS transcript_format   TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'meetings_transcript_format_check'
    ) THEN
        ALTER TABLE meetings ADD CONSTRAINT meetings_transcript_format_check
            CHECK (transcript_format IS NULL OR transcript_format IN ('txt', 'vtt'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'meetings_transcript_sha256_check'
    ) THEN
        ALTER TABLE meetings ADD CONSTRAINT meetings_transcript_sha256_check
            CHECK (transcript_sha256 IS NULL OR length(transcript_sha256) = 64);
    END IF;

    -- Todo o nada: si hay archivo, están sus cuatro datos.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'meetings_transcript_complete'
    ) THEN
        ALTER TABLE meetings ADD CONSTRAINT meetings_transcript_complete CHECK (
            (transcript_path IS NULL AND transcript_sha256 IS NULL
             AND transcript_filename IS NULL AND transcript_format IS NULL)
            OR (transcript_path IS NOT NULL AND transcript_sha256 IS NOT NULL
                AND transcript_filename IS NOT NULL AND transcript_format IS NOT NULL)
        );
    END IF;

    -- La procedencia y el archivo dicen lo mismo: «import» si y solo si hay
    -- archivo importado. Así una transcripción del audio no puede quedar
    -- marcada como importada, ni al revés.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'meetings_transcript_is_import'
    ) THEN
        ALTER TABLE meetings ADD CONSTRAINT meetings_transcript_is_import CHECK (
            (transcription_model IS NOT DISTINCT FROM 'import')
                = (transcript_format IS NOT NULL)
        );
    END IF;

    -- Una sola fuente: una reunión con transcripción importada no tiene
    -- audio, y viceversa.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'meetings_single_source'
    ) THEN
        ALTER TABLE meetings ADD CONSTRAINT meetings_single_source
            CHECK (transcript_path IS NULL OR audio_path IS NULL);
    END IF;
END
$$;
