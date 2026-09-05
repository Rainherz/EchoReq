-- Contexto de dominio del proyecto.
--
-- Una descripción corta de qué sistema se está especificando. No es
-- decoración: entra en el prompt de generación, así que el agente sabe si
-- «turno» es una cita médica o un turno de trabajo, y puede juzgar qué es un
-- requisito en ese dominio y qué es conversación.
--
-- Queda en el proyecto y no en cada reunión porque no cambia entre
-- iteraciones, y repetirlo abriría la puerta a que difiera.

ALTER TABLE projects
    ADD COLUMN domain TEXT NOT NULL DEFAULT '',
    ADD COLUMN archived_at TIMESTAMPTZ;

-- El nombre identifica el workspace en la interfaz: no puede estar vacío ni
-- repetirse entre proyectos activos.
ALTER TABLE projects
    ADD CONSTRAINT projects_name_not_blank CHECK (length(btrim(name)) > 0);

CREATE UNIQUE INDEX projects_name_unique
    ON projects (lower(btrim(name)))
    WHERE archived_at IS NULL;

UPDATE projects
SET domain = 'Sistema de gestión de turnos para una clínica: reserva, cancelación, recordatorios y agenda de recepción.'
WHERE id = 'clinica-norte';
