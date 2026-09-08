-- Quién arbitra los desacuerdos.
--
-- Consolidar no es una decisión del revisor: es la postura del equipo sobre
-- su propio documento. Si cualquiera de los dos puede hacerlo, el que llega
-- segundo puede hacer regir su propia versión sobre la del otro, y eso deja
-- de ser arbitraje.
--
-- Va como columna propia y no como un valor de `role` porque `role` es texto
-- descriptivo que alguien tipea —hoy conviven «analista» y «Analista» en la
-- misma base— y colgar un permiso de una comparación de cadenas lo haría
-- depender de una mayúscula.
--
-- La pantalla de Concordancia también le muestra a cada revisor el texto del
-- otro. Aunque no consolide, leerlo le da calibración para la reunión
-- siguiente: la restricción cierra ese canal además de ordenar el arbitraje.

ALTER TABLE participants
    ADD COLUMN is_lead BOOLEAN NOT NULL DEFAULT FALSE;

-- A lo sumo un jefe de analistas. Dos personas arbitrando el mismo documento
-- reabren el problema que la columna vino a cerrar.
CREATE UNIQUE INDEX participants_single_lead
    ON participants ((TRUE)) WHERE is_lead;
