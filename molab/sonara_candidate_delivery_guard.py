"""Delivery guard for candidate audio already scored by SONARA.

The guard rejects unreadable/empty PCM candidates before publishing A/B.
It does not use subjective musical quality as a hard gate.
"""
from __future__ import annotations
import math


def select_deliverable_candidates(evaluated, requested_count):
    """Return best valid candidates, preserving requested A/B count.

    An invalid WAV must not be uploaded as track B merely because its score
    was lower than track A. Fail closed before uploading either track if there
    are insufficient valid candidates.
    """
    try:
        wanted = int(requested_count)
    except (ValueError, TypeError) as error:
        raise ValueError("Invalid requested candidate count") from error
    if wanted not in (1, 2):
        raise ValueError("Requested candidate count must be one or two")

    deliverable = []
    for item in evaluated:
        if not isinstance(item, dict):
            continue
        report = item.get("audio")
        if not isinstance(report, dict) or report.get("ok") is not True:
            continue
        duration = report.get("durationSeconds", 0)
        rate = report.get("sampleRate", 0)
        channels = report.get("channels", 0)
        score = item.get("score", 0)
        try:
            valid = (math.isfinite(float(duration)) and float(duration) > 0
                     and math.isfinite(float(score))
                     and int(rate) > 0 and int(channels) in (1, 2))
        except (TypeError, ValueError, OverflowError):
            valid = False
        if valid:
            deliverable.append(item)

    deliverable.sort(key=lambda item: item["score"], reverse=True)
    if len(deliverable) < wanted:
        raise RuntimeError("Insufficient valid PCM WAV candidates for requested delivery")
    return deliverable[:wanted]
