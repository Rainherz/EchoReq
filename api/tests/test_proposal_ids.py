"""Identificadores de propuestas.

El identificador era `p-<iteración>-<índice>`, sin el proyecto ni la reunión.
Dos proyectos en su primera iteración generaban los mismos `p-01-01`, y como
el guardado usa `ON CONFLICT (id) DO NOTHING`, la segunda corrida se perdía
entera sin que nada lo dijera.
"""

from __future__ import annotations

from app.requirements.domain.entities import Turn
from app.requirements.domain.generation import (
    DraftProposal,
    GenerationRequest,
    GenerationResult,
)
from app.requirements.generate import generate_proposals


class _FixedEngine:
    def __init__(self, drafts: list[DraftProposal]) -> None:
        self._drafts = drafts

    def generate(self, request: GenerationRequest) -> GenerationResult:
        return GenerationResult(
            proposals=self._drafts, model_id="fake", params={}, prompt="", response=""
        )


def _request(project_id: str, meeting_id: str) -> GenerationRequest:
    return GenerationRequest(
        project_id=project_id,
        meeting_id=meeting_id,
        iteration=1,
        mode="discovery",
        turns=[Turn(meeting_id, 1, "S1", "00:01", "Necesitamos registrar visitas.")],
        baseline=[],
    )


def _draft(target: str) -> DraftProposal:
    return DraftProposal(
        operation="create",
        target_id=target,
        content="Como especialista quiero registrar visitas.",
        source_turn_ids=[1],
        rationale="Lo pide el cliente.",
    )


def _ids(project_id: str, meeting_id: str) -> list[str]:
    engine = _FixedEngine([_draft("R-01"), _draft("R-02")])
    outcome = generate_proposals(engine, _request(project_id, meeting_id))
    return [p.id for p in outcome.accepted]


def test_two_projects_never_share_proposal_ids() -> None:
    first = _ids("proyecto-a", "proyecto-a-r1")
    second = _ids("proyecto-b", "proyecto-b-r1")

    assert not set(first) & set(second)


def test_ids_are_unique_within_a_batch() -> None:
    ids = _ids("proyecto-a", "proyecto-a-r1")

    assert len(ids) == len(set(ids))


def test_id_names_the_meeting_it_came_from() -> None:
    ids = _ids("proyecto-a", "proyecto-a-r1")

    assert all("proyecto-a-r1" in pid for pid in ids)
