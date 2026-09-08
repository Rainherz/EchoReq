-- Los roles que el proyecto reconoce.
--
-- Un documento que acumula reuniones desparrama el vocabulario: la misma
-- persona entra como «especialista» en una y como «especialista de la UGEL»
-- en la siguiente, y la trazabilidad por actor se parte en dos sin que nada
-- avise. El glosario es contra qué comparar.
--
-- No traduce ni fusiona. Un actor que no figura acá queda marcado «sin
-- definir» y sigue marcado hasta que alguien arregle el texto del requisito:
-- una tabla de alias dejaría el documento diciendo lo que no quiere decir,
-- prolijo por fuera. Acá se declara quién existe, no se reescribe quién pidió.
--
-- Es configuración del proyecto, no dato del estudio: se corrige y se borra,
-- sin el trigger de inmutabilidad que sí llevan el log de requisitos y las
-- decisiones.

CREATE TABLE actor_glossary (
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sin distinguir mayúsculas: «Directivo» y «directivo» son el mismo rol, y
-- admitir los dos reabriría en el glosario el problema que el glosario vino
-- a cerrar.
CREATE UNIQUE INDEX actor_glossary_name
    ON actor_glossary (project_id, lower(name));
