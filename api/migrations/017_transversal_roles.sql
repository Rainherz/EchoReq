-- Roles que no distinguen a nadie.
--
-- «Usuario: todos los actores, no excluye a nadie» no es un rol: es la
-- ausencia de uno. Los requisitos que lo nombran —iniciar sesión, restablecer
-- la contraseña— aplican a cualquiera, y por eso no dicen quién los pide.
--
-- Sin la marca, la lista los pone al lado de los roles de dominio y sus
-- conteos se leen como comparables: «Directivo 10 · Usuario 2» sugiere que el
-- Usuario pide dos cosas, cuando lo que dice es que dos requisitos no
-- dependen de quién sos. Son cantidades de distinta naturaleza sumadas en la
-- misma columna.
--
-- No se modela contención —«Directivo es un Usuario»— a propósito. Sería
-- correcto y arruinaría la herramienta: cada rol de dominio pasaría a
-- coincidir también con el transversal y el conteo dejaría de tener
-- respuesta. La marca separa sin jerarquizar, que es lo único que hace falta
-- para no comparar peras con manzanas.

ALTER TABLE actor_glossary
    ADD COLUMN transversal BOOLEAN NOT NULL DEFAULT FALSE;
