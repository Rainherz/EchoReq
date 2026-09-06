-- El modo de la reunión, junto a la latencia de cada decisión.
--
-- `seconds` no significa lo mismo en los dos modos y hasta ahora nada lo
-- decía. En documentación viva las propuestas se muestran de a una, así que
-- el intervalo mide cuánto tardó el revisor en decidir esa propuesta. En
-- descubrimiento se muestran todas juntas y el revisor entra y sale de ellas:
-- el intervalo mide cuánto estuvo ese candidato al frente, que es otra cosa y
-- no se puede promediar con la anterior.
--
-- La curva que compara iteraciones arranca en la 2 justamente por esto. Traer
-- el modo hasta la vista permite que las cifras lo digan, en vez de que haya
-- que saberlo de memoria.

-- Se recrea en vez de reemplazarse: la columna nueva no va al final y
-- PostgreSQL no admite reordenar columnas de una vista existente.
DROP VIEW IF EXISTS review_timings;

CREATE VIEW review_timings AS
SELECT
    d.id,
    p.project_id,
    p.iteration,
    d.proposal_id,
    d.participant_id,
    d.action,
    p.known_defective,
    EXTRACT(EPOCH FROM (d.decided_at - d.presented_at)) AS seconds,
    (c.id IS NOT NULL)      AS corrected,
    c.intended_action,
    c.reason                AS correction_reason,
    m.mode
FROM review_decisions d
JOIN change_proposals p ON p.id = d.proposal_id
JOIN meetings m ON m.id = p.meeting_id
LEFT JOIN decision_corrections c ON c.decision_id = d.id;
