"""Sonara V10 Self Evolution Platform - Evolution Manager.

Master orchestrator for the V10 self-evolution intelligence brain.
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

from .improvement_detector import ImprovementDetector, ImprovementRecord
from .failure_detector import FailureDetector, FailureRecord
from .success_detector import SuccessDetector, SuccessRecord
from .knowledge_extractor import KnowledgeExtractor, KnowledgeInsight
from .weakness_cluster import WeaknessCluster, WeaknessClusterItem
from .prompt_evolution import PromptEvolution, PromptEvolutionRecord
from .lora_evolution import LoraEvolution, LoraEvolutionRecord
from .dataset_evolution import DatasetEvolution, DatasetEvolutionRecord
from .automatic_planner import AutomaticPlanner, EvolutionPlanItem
from .improvement_score import ImprovementScoreCalculator, EvolutionIndices
from .research_scheduler import ResearchScheduler, ScheduledResearchTask
from .future_version_generator import FutureVersionGenerator, VersionSpecification
from .roadmap_generator import RoadmapGenerator, RoadmapMilestone
from .self_review import SelfReview, SelfReviewReport


class EvolutionReport(BaseModel, frozen=True):
    """Comprehensive V10 Evolution Cycle Report."""

    timestamp: str
    indices: EvolutionIndices
    improvements: List[ImprovementRecord]
    failures: List[FailureRecord]
    successes: List[SuccessRecord]
    insights: List[KnowledgeInsight]
    weaknesses: List[WeaknessClusterItem]
    plan: List[EvolutionPlanItem]
    future_versions: List[VersionSpecification]
    self_review: SelfReviewReport


class EvolutionManager:
    """Master orchestrator for the Sonara V10 Self Evolution Platform."""

    def __init__(self):
        self.improvement_detector = ImprovementDetector()
        self.failure_detector = FailureDetector()
        self.success_detector = SuccessDetector()
        self.knowledge_extractor = KnowledgeExtractor()
        self.weakness_cluster = WeaknessCluster()
        self.prompt_evolution = PromptEvolution()
        self.lora_evolution = LoraEvolution()
        self.dataset_evolution = DatasetEvolution()
        self.automatic_planner = AutomaticPlanner()
        self.improvement_score = ImprovementScoreCalculator()
        self.research_scheduler = ResearchScheduler()
        self.future_version_generator = FutureVersionGenerator()
        self.roadmap_generator = RoadmapGenerator()
        self.self_review = SelfReview()

    def run_evolution_cycle(self) -> EvolutionReport:
        """Executes a full self-evolution cycle."""
        indices = self.improvement_score.calculate_indices()
        improvements = self.improvement_detector.detect_improvements([])
        failures = self.failure_detector.detect_failures([])
        successes = self.success_detector.detect_successes([])
        insights = self.knowledge_extractor.extract_insights()
        weaknesses = self.weakness_cluster.cluster_weaknesses([])
        plan = self.automatic_planner.generate_plan()
        future_versions = self.future_version_generator.generate_versions()
        review = self.self_review.review()

        return EvolutionReport(
            timestamp="2026-08-01T00:00:00Z",
            indices=indices,
            improvements=improvements,
            failures=failures,
            successes=successes,
            insights=insights,
            weaknesses=weaknesses,
            plan=plan,
            future_versions=future_versions,
            self_review=review
        )
