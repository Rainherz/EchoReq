-- Procedencia de la transcripción.
--
-- El estudio compara iteraciones: la reunión 1 contra la 5. Si el
-- transcriptor cambia en el medio, la deriva que se mide deja de ser la de
-- los requisitos y pasa a incluir la del transcriptor, sin que nada lo
-- delate. Registrar con qué modelo y con qué parámetros salió cada
-- transcripción es lo que permite descartar esa explicación alternativa
-- cuando se discuta el resultado.
--
-- Es el mismo argumento que sostiene `llm_calls`, un escalón más abajo: si
-- no se registra qué produjo el dato, no se puede reproducir el estudio.

ALTER TABLE meetings
    ADD COLUMN transcription_model  TEXT,
    ADD COLUMN transcription_params JSONB,
    ADD COLUMN transcribed_at       TIMESTAMPTZ;

-- Si está transcripta, se sabe con qué. Las reuniones del fixture quedan
-- exceptuadas: sus turnos se cargaron a mano y nunca pasaron por un modelo.
UPDATE meetings SET transcription_model = 'fixture'
WHERE transcription_status = 'done' AND transcription_model IS NULL;

ALTER TABLE meetings
    ADD CONSTRAINT meetings_transcription_provenance CHECK (
        transcription_status <> 'done' OR transcription_model IS NOT NULL
    );
