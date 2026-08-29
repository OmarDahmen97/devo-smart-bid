# file: app/matching/certifications_matching.py
"""
Certification coverage scoring: structured mission certifications vs
candidate's 'certifications' field in merged_candidates (list of
{name, issuer, year} objects).

Same coverage logic as skills_matching.py. Note: with typically 0-2
certifications per mission, this score is often effectively binary
(0.0, 0.5, or 1.0) -- that instability is handled at the global
weighting level (low weight, e.g. 5-8%), not here.
"""

from typing import Optional
from pydantic import BaseModel


class CertificationCoverageResult(BaseModel):
    score: Optional[float]  # None = criterion not applicable, exclude from weighted sum
    matched: list[str]
    missing: list[str]


def compute_certification_coverage(
    mission_certifications: list[str],
    candidate_certifications: list[dict],
) -> CertificationCoverageResult:
    """
    candidate_certifications: raw list of {name, issuer, year} dicts as
    stored in merged_candidates.certifications -- extracts .name here.

    Returns score=None when the mission requires no certifications --
    excluded from the weighted global score, same as skills/seniority.
    """
    if not mission_certifications:
        return CertificationCoverageResult(score=None, matched=[], missing=[])

    mission_set = set(mission_certifications)
    candidate_set = {
        c["name"].strip()
        for c in (candidate_certifications or [])
        if isinstance(c, dict) and isinstance(c.get("name"), str) and c["name"].strip()
    }

    matched = sorted(mission_set & candidate_set)
    missing = sorted(mission_set - candidate_set)

    score = len(matched) / len(mission_set)

    return CertificationCoverageResult(score=score, matched=matched, missing=missing)