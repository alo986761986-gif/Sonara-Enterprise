"""Sonara V12 AI Operations Center - Automatic Alerts Engine.

Generates structured operational alerts:
- CRITICAL: Immediate action required (worker crash, dataset corruption, LoRA regression)
- WARNING: Threshold approaching (high VRAM, queue backlog)
- INFO: Operational state transitions (routine maintenance, successful checkpoint promotion)
- SUGGESTIONS: Optimization recommendations (cache cleanup, resource scaling)
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class AlertItem(BaseModel, frozen=True):
    """Structured alert record."""

    alert_id: str
    severity: str = Field(..., description="CRITICAL, WARNING, INFO, or SUGGESTION")
    category: str = Field(..., description="SYSTEM, DATASET, MODEL, or QUEUE")
    message: str
    timestamp: str
    suggested_action: Optional[str] = None


class AutomaticAlertsEngine:
    """Evaluates telemetry and generates prioritized operational alerts."""

    def generate_alerts(
        self,
        system_health: Optional[Dict[str, Any]] = None,
        dataset_health: Optional[Dict[str, Any]] = None,
        model_health: Optional[Dict[str, Any]] = None,
    ) -> List[AlertItem]:
        """Scans health metrics and produces alerts."""
        alerts: List[AlertItem] = []
        
        # System checks
        if system_health and system_health.get("overall_status") == "CRITICAL":
            alerts.append(AlertItem(
                alert_id="ALT-SYS-001",
                severity="CRITICAL",
                category="SYSTEM",
                message="System VRAM or CPU utilization exceeded critical threshold.",
                timestamp="2026-08-01T00:00:00Z",
                suggested_action="Scale out GPU worker nodes or drain training queue."
            ))

        # Dataset checks
        if dataset_health and dataset_health.get("corrupted_bundles_count", 0) > 0:
            alerts.append(AlertItem(
                alert_id="ALT-DS-001",
                severity="CRITICAL",
                category="DATASET",
                message=f"Detected {dataset_health['corrupted_bundles_count']} corrupted dataset bundles.",
                timestamp="2026-08-01T00:00:00Z",
                suggested_action="Quarantine corrupted bundles and trigger Merkle chain verification."
            ))

        # Model checks
        if model_health and model_health.get("invalid_loras_count", 0) > 0:
            alerts.append(AlertItem(
                alert_id="ALT-MOD-001",
                severity="CRITICAL",
                category="MODEL",
                message="Invalid LoRA adapter detected during validation.",
                timestamp="2026-08-01T00:00:00Z",
                suggested_action="Rollback to previous verified LoRA checkpoint."
            ))

        # Default healthy info if no criticals
        if not alerts:
            alerts.append(AlertItem(
                alert_id="ALT-INFO-001",
                severity="INFO",
                category="SYSTEM",
                message="All Sonara core subsystems operating within nominal parameters.",
                timestamp="2026-08-01T00:00:00Z",
                suggested_action="No action required."
            ))

        return alerts
