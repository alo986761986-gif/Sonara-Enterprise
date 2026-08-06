"""Integration test for full Sonara Core V9 Research Engine continuous learning pipeline."""

import pytest
import shutil
import uuid

from engine.research.continuous_learning import ContinuousLearningLoop
from engine.research.research_dashboard import ResearchDashboard
from engine.research.research_manager import ResearchManager
from engine.research.hypothesis_engine import HypothesisEngine


@pytest.fixture
def temp_research_workspace(tmp_path):
    ws = tmp_path / "research_ws"
    ws.mkdir()
    yield ws
    shutil.rmtree(ws, ignore_errors=True)


def test_full_continuous_learning_cycle_integration(temp_research_workspace):
    rm = ResearchManager(storage_dir=temp_research_workspace / "experiments")
    he = HypothesisEngine(storage_dir=temp_research_workspace / "hypotheses")
    loop = ContinuousLearningLoop(research_manager=rm, hypothesis_engine=he)

    cycle_id = f"test_cycle_{uuid.uuid4().hex[:8]}"
    result = loop.run_cycle(
        cycle_id=cycle_id,
        genre="Techno",
        num_trials=3,
        candidate_cfg_offset=0.5,
    )

    assert result.cycle_id == cycle_id
    assert result.experiment_id == f"exp_{cycle_id}"
    assert result.hypothesis_id == f"hyp_{cycle_id}"
    assert result.statistical_decision in ("VALIDATED", "REJECTED")
    assert result.promotion_decision in ("PROMOTED", "REJECTED")
    assert result.dpo_dataset_size >= 1

    dashboard = ResearchDashboard()
    metrics = dashboard.get_dashboard_metrics()
    assert metrics.total_experiments >= 1
    assert metrics.total_hypotheses >= 1
