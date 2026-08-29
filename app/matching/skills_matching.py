# file: app/matching/skills_matching.py
"""
Skills coverage scoring: structured mission skills vs candidate's
'skills' field in merged_candidates.

Both sides are expected to already be canonicalized via
normalize_sections.normalize_skills.normalize_skill_list -- mission
skills are normalized inside mission_extractor.py, candidate skills
are normalized at ingestion time. This lets us match on exact set
membership instead of re-running embedding similarity here.
"""

from typing import Optional
from pydantic import BaseModel


class SkillCoverageResult(BaseModel):
    score: Optional[float]  # None = criterion not applicable, exclude from weighted sum
    matched: list[str]
    missing: list[str]


def compute_skill_coverage(
    mission_skills: list[str],
    candidate_skills: list[str],
) -> SkillCoverageResult:
    """
    Coverage = proportion of mission-required skills the candidate has.

    Returns score=None when the mission has no extracted skills --
    this criterion should then be excluded from the weighted global
    score (redistribute its weight) rather than scored as 0, same
    logic as seniority=null.
    """
    if not mission_skills:
        return SkillCoverageResult(score=None, matched=[], missing=[])

    mission_set = set(mission_skills)
    candidate_set = set(candidate_skills or [])

    matched = sorted(mission_set & candidate_set)
    missing = sorted(mission_set - candidate_set)

    score = len(matched) / len(mission_set)

    return SkillCoverageResult(score=score, matched=matched, missing=missing)