-- Audio de la reunión y estado de su transcripción.
--
-- El archivo va al disco, no a la base: el audio de una reunión pesa decenas
-- de megabytes y meterlo en una tabla del log inflaría los respaldos de algo
-- que no se consulta nunca. La base guarda dónde está y cómo verificarlo.
--
-- El hash importa en un instrumento de investigación: permite comprobar que
-- el audio del que salió una transcripción es el mismo que se grabó, sin
-- tener que confiar en el nombre del archivo.

ALTER TABLE meetings
    ADD COLUMN audio_filename TEXT,
    ADD COLUMN audio_path     TEXT,
    ADD COLUMN audio_bytes    BIGINT CHECK (audio_bytes IS NULL OR audio_bytes > 0),
    ADD COLUMN audio_sha256   TEXT CHECK (audio_sha256 IS NULL OR length(audio_sha256) = 64),
    ADD COLUMN uploaded_at    TIMESTAMPTZ,
    -- pending  · cargado, esperando transcripción
    -- running  · transcribiendo
    -- done     · turnos disponibles
    -- failed   · falló, el motivo queda en transcription_error
    ADD COLUMN transcription_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (transcription_status IN ('pending', 'running', 'done', 'failed')),
    ADD COLUMN transcription_error  TEXT,
    -- Todo o nada: si hay audio, están sus cuatro datos.
    ADD CONSTRAINT meetings_audio_complete CHECK (
        (audio_path IS NULL AND audio_sha256 IS NULL AND audio_bytes IS NULL)
        OR (audio_path IS NOT NULL AND audio_sha256 IS NOT NULL AND audio_bytes IS NOT NULL)
    );

-- Las reuniones del fixture ya tienen turnos cargados a mano: su
-- transcripción está hecha aunque nunca haya pasado por el pipeline.
UPDATE meetings m
SET transcription_status = 'done'
WHERE EXISTS (SELECT 1 FROM turns t WHERE t.meeting_id = m.id);
