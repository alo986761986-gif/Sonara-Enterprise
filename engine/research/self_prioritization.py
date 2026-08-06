"""Sonara V10 Self Prioritization Engine.

Computes multi-objective costs, risks, and expected gains for candidate experiments,
ranking them to determine the optimal next research step.
"""

from typing import Dict, List
from pydantic import BaseModel, Field, ConfigDict


class PrioritizedProposal(BaseModel):
    """Immutable scoring and ranking result for a research candidate."""

    model_config = ConfigDict(frozen=True)

    proposal_id: str = Field(..., description="Proposal identifier")
    title: str = Field(..., description="Proposal title")
    genre: str = Field(..., description="Target genre")
    expected_research_gain: float = Field(..., ge=0.0, le=100.0)
    expected_quality_gain: float = Field(..., ge=0.0, le=100.0)
    expected_commercial_gain: float = Field(..., ge=0.0, le=100.0)
    training_cost_usd: float = Field(..., ge=0.0)
    gpu_cost_usd: float = Field(..., ge=0.0)
    storage_cost_gb: float = Field(..., ge=0.0)
    risk_score: float = Field(..., ge=0.0, le=10.0, description="Risk score (0-10)")
    priority_score: float = Field(..., description="Final computed ROI & Priority ranking score")


class SelfPrioritizationEngine:
    """Ranks experimental proposals balancing potential scientific gains against compute & risk costs."""

    def __init__(self, cost_weight: float = 0.15, risk_weight: float = 0.25) -> None:
        self.cost_weight = cost_weight
        self.risk_weight = risk_weight

    def evaluate_and_rank(self, proposals: List[Dict[str, any]]) -> List[PrioritizedProposal]:
        """Evaluates a list of proposals and returns them sorted by priority score descending."""
        results = []
        for p in proposals:
            erg = float(p.get("expected_research_gain", 50.0))
            eqg = float(p.get("expected_quality_gain", 50.0))
            ecg = float(p.get("expected_commercial_gain", 50.0))
            t_cost = float(p.get("training_cost_usd", 10.0))
            gpu_cost = float(p.get("gpu_cost_usd", 5.0))
            storage = float(p.get("storage_cost_gb", 2.0))
            risk = float(p.get("risk_score", 3.0))

            benefit = (erg * 0.3) + (eqg * 0.4) + (ecg * 0.3)
            total_financial_cost = t_cost + gpu_cost + (storage * 0.1)
            cost_penalty = min(total_financial_cost * self.cost_weight, 50.0)
            risk_penalty = risk * self.risk_weight * 10.0

            priority_score = round(benefit - cost_penalty - risk_penalty, 2)

            results.append(
                PrioritizedProposal(
                    proposal_id=str(p.get("proposal_id", "prop_unknown")),
                    title=str(p.get("title", "Untitled Proposal")),
                    genre=str(p.get("genre", "All")),
                    expected_research_gain=erg,
                    expected_quality_gain=eqg,
                    expected_commercial_gain=ecg,
                    training_cost_usd=t_cost,
                    gpu_cost_usd=gpu_cost,
                    storage_cost_gb=storage,
                    risk_score=risk,
                    priority_score=priority_score,
                )
            )

        results.sort(key=lambda x: x.priority_score, reverse=True)
        return results
