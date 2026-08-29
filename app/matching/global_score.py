# file: app/matching/global_score.py
"""
Combines experience similarity (existing SBERT via is_candidate_relevant_v2),
skills coverage, and certifications coverage into a single weighted score.

Design: seniority and domain are NOT yet implemented (deferred), so they're
simply absent from BASE_WEIGHTS below -- when you add them later, just add
their entries here, nothing else changes.

Weight redistribution happens at TWO levels, both handled by the same
mechanism (only sum weights of non-None scores, normalize to 1.0):
  1. Structural: seniority/domain aren't in BASE_WEIGHTS at all yet.
  2. Per-mission: skill_score or cert_score can be None when the mission
     had no extracted skills/certifications (see skills_matching.py /
     certifications_matching.py) -- their weight is redistributed to
     whatever criteria ARE available for that specific mission.

Relative proportions from the original 5-criteria target formula
(45/20/15/10/10) are preserved among whatever's active.
"""

from typing import Optional
from pydantic import BaseModel

# Original target formula: experience=45, skills=20, certifications=15,
# seniority=10, domain=10. Only implemented criteria are listed here --
# add "seniority": 10 and "domain": 10 once those modules exist.
BASE_WEIGHTS: dict[str, float] = {
    "experience": 70,
    "skills": 10,
    "certifications": 20,
}


class GlobalScoreResult(BaseModel):
    global_score: float
    breakdown: dict[str, dict]  # {criterion: {"score": float, "weight_used": float}}


def compute_global_score(
    experience_score: float,
    skill_score: Optional[float],
    certification_score: Optional[float],
) -> GlobalScoreResult:
    """
    experience_score: always present (from is_candidate_relevant_v2's avg_score).
    skill_score / certification_score: None if the mission had no such
    requirement extracted -- excluded and weight redistributed.
    """
    raw_scores = {
        "experience": experience_score,
        "skills": skill_score,
        "certifications": certification_score,
    }

    active = {k: v for k, v in raw_scores.items() if v is not None}
    total_weight = sum(BASE_WEIGHTS[k] for k in active)

    if total_weight == 0:
        return GlobalScoreResult(global_score=0.0, breakdown={})

    global_score = sum(raw_scores[k] * BASE_WEIGHTS[k] for k in active) / total_weight

    breakdown = {
        k: {"score": round(raw_scores[k], 3), "weight_used": round(BASE_WEIGHTS[k] / total_weight, 3)}
        for k in active
    }

    return GlobalScoreResult(global_score=round(global_score, 3), breakdown=breakdown)