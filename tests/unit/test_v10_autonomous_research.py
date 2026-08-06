"""Unit tests for Sonara V10 Autonomous Research Director modules."""

import pytest
from engine.research.research_score import ResearchScoreEngine
from engine.research.research_memory import ResearchMemory
from engine.research.self_prioritization import SelfPrioritizationEngine
from engine.research.experiment_planner import ExperimentPlanner
from engine.research.research_director import ResearchDirector
from engine.research.roadmap_generator import RoadmapGenerator
from engine.research.autonomous_decision_engine import AutonomousDecisionEngine
from engine.research.research_kpi import ResearchKPIEngine
from engine.research.yearly_report import YearlyReportGenerator


def test_research_score_engine():
    engine = ResearchScoreEngine()
    eval_res = engine.compute_score(
        proposal_id="prop_001",
        knowledge_gain=80.0,
        novelty=75.0,
        commercial_impact=6.0,
        quality_impact=7.0,
        human_preference=65.0,
        statistical_confidence=0.95,
    )
    assert eval_res.proposal_id == "prop_001"
    assert eval_res.research_value_score > 0.0
    assert "Research Value Score" in eval_res.rationale


def test_research_memory_and_trends():
    memory = ResearchMemory()
    memory.append("experiment", "exp_101", {"quality": 8.1, "genre": "Deep House"})
    memory.append("experiment", "exp_102", {"quality": 8.5, "genre": "Deep House"})

    all_recs = memory.get_all()
    assert len(all_recs) == 2

    matching = memory.search_by_category("experiment")
    assert len(matching) == 2

    by_kw = memory.search_by_keyword("deep house")
    assert len(by_kw) == 2

    trends = memory.analyze_trends("experiment", "quality")
    assert trends["count"] == 2
    assert trends["mean"] == 8.3
    assert trends["trend"] == "improving"


def test_self_prioritization_engine():
    engine = SelfPrioritizationEngine()
    proposals = [
        {
            "proposal_id": "p1",
            "title": "CFG Boost",
            "genre": "Deep House",
            "expected_research_gain": 80,
            "expected_quality_gain": 70,
            "expected_commercial_gain": 60,
            "training_cost_usd": 5.0,
            "gpu_cost_usd": 2.0,
            "storage_cost_gb": 1.0,
            "risk_score": 2.0,
        },
        {
            "proposal_id": "p2",
            "title": "Risky LoRA",
            "genre": "Techno",
            "expected_research_gain": 95,
            "expected_quality_gain": 90,
            "expected_commercial_gain": 85,
            "training_cost_usd": 50.0,
            "gpu_cost_usd": 30.0,
            "storage_cost_gb": 10.0,
            "risk_score": 8.5,
        },
    ]
    ranked = engine.evaluate_and_rank(proposals)
    assert len(ranked) == 2
    assert ranked[0].proposal_id == "p1"  # Lower risk/cost wins priority


def test_experiment_planner():
    planner = ExperimentPlanner()
    plan = planner.generate_weekly_plan(week_number=5)
    assert plan.week_number == 5
    assert len(plan.schedule) == 7
    assert plan.schedule[0].day == "Monday"
    assert plan.schedule[6].day == "Sunday"


def test_research_director():
    director = ResearchDirector()
    candidates = [
        {
            "proposal_id": "prop_a",
            "title": "Deep House Transient Tuning",
            "genre": "Deep House",
            "knowledge_gain": 85.0,
            "novelty": 80.0,
            "commercial_impact": 7.0,
            "quality_impact": 8.0,
            "human_preference": 70.0,
            "training_cost_usd": 5.0,
            "gpu_cost_usd": 2.0,
            "storage_cost_gb": 1.0,
            "risk_score": 2.0,
        }
    ]
    directive = director.analyze_and_decide(candidates)
    assert directive.directive_id == "dir_prop_a"
    assert directive.selected_experiment.proposal_id == "prop_a"


def test_roadmap_generator():
    generator = RoadmapGenerator()
    roadmap_30 = generator.generate_roadmap(30)
    assert roadmap_30.horizon_days == 30
    assert len(roadmap_30.phases) == 3

    roadmap_90 = generator.generate_roadmap(90)
    assert roadmap_90.horizon_days == 90

    roadmap_365 = generator.generate_roadmap(365)
    assert roadmap_365.horizon_days == 365


def test_autonomous_decision_engine():
    engine = AutonomousDecisionEngine()
    telemetry = {
        "quality_delta": 0.02,
        "commercial_delta": 0.01,
        "human_win_rate": 0.44,
        "lora_regression_detected": True,
        "model_version": "v1.2",
        "lora_version": "lora_v1.2",
    }
    actions = engine.evaluate_and_act(telemetry)
    assert len(actions) == 4
    assert any("Quality stagnating" in a.trigger_condition for a in actions)
    assert any("Commercial score stagnating" in a.trigger_condition for a in actions)
    assert any("Human preference" in a.trigger_condition for a in actions)
    assert any("LoRA performed worse" in a.trigger_condition for a in actions)


def test_research_kpi_engine():
    engine = ResearchKPIEngine()
    snapshot = engine.compute_snapshot("snap_01", 15.0, 12.0, 72.5, 5.0, 0.9, 0.95, 1.5, 20.0)
    assert snapshot.snapshot_id == "snap_01"
    assert snapshot.quality_growth_rate == 15.0
    assert snapshot.human_preference_rate == 72.5


def test_yearly_report_generator():
    generator = YearlyReportGenerator()
    report = generator.generate_report(2026, {"total_experiments": 400, "validated": 300, "rejected": 100})
    assert report.year == 2026
    assert report.total_experiments == 400
    assert report.validated_hypotheses == 300
    assert "# Sonara Producer AI" in report.markdown_content
