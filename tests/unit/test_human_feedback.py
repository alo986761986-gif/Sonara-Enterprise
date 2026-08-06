"""Unit tests for HumanFeedbackEngine."""

import pytest
import shutil

from engine.research.human_feedback import HumanFeedbackEngine


@pytest.fixture
def temp_fb_dir(tmp_path):
    d = tmp_path / "human_feedback"
    d.mkdir()
    yield d
    shutil.rmtree(d, ignore_errors=True)


def test_record_vote_and_export_dpo(temp_fb_dir):
    engine = HumanFeedbackEngine(storage_dir=temp_fb_dir)
    vote = engine.record_vote(
        vote_id="vote_001",
        listener_id="judge_1",
        track_uuid="uuid_a",
        preferred_uuid="uuid_b",
        rejected_uuid="uuid_a",
        genre="Techno",
        rating=4.5,
    )
    assert vote.vote_id == "vote_001"

    dpo = engine.export_dpo_dataset()
    assert len(dpo) == 1
    assert dpo[0]["chosen_uuid"] == "uuid_b"
    assert dpo[0]["rejected_uuid"] == "uuid_a"


def test_export_ipo_and_orpo(temp_fb_dir):
    engine = HumanFeedbackEngine(storage_dir=temp_fb_dir)
    engine.record_vote(
        vote_id="vote_002",
        listener_id="judge_2",
        track_uuid="uuid_1",
        preferred_uuid="uuid_2",
        rejected_uuid="uuid_1",
    )

    ipo = engine.export_ipo_dataset()
    orpo = engine.export_orpo_dataset()

    assert len(ipo) == 1
    assert ipo[0]["alignment_objective"] == "IPO_SQUARED_LOSS"
    assert len(orpo) == 1
    assert orpo[0]["alignment_objective"] == "ORPO_ODDS_RATIO_LAMBDA"
