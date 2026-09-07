-- El tipo de defecto, junto a la latencia.
--
-- Qué acción demuestra haber advertido un defecto depende de su tipo: en una
-- cita desplazada el texto del requisito es correcto y lo falso es la
-- evidencia, así que editar la redacción no demuestra haberla contrastado.
-- Sin el tipo a la vista, la métrica sólo puede contar aceptaciones y
-- sobreestima la detección.

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
    m.mode,
    p.defect_kind
FROM review_decisions d
JOIN change_proposals p ON p.id = d.proposal_id
JOIN meetings m ON m.id = p.meeting_id
LEFT JOIN decision_corrections c ON c.decision_id = d.id;
