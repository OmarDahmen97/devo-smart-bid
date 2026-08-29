# file: app/matching/mission_extractor.py
"""
Extracts structured criteria (skills, certifications, domain, seniority)
from a free-text mission description, using Gemini.

Does NOT touch the existing SBERT experience-matching pipeline.
This structured output feeds the *new* scoring components only
(skills coverage, certifications, domain, seniority).
"""

import json
import logging
from typing import Optional
from pydantic import BaseModel, Field

from app.normalize_sections.normalize_skills import normalize_skill_list

logger = logging.getLogger(__name__)

DOMAIN_TAXONOMY = [
    "Banking",
    "Insurance",
    "Telecom",
    "Industry",
    "Healthcare",
    "Public Sector",
    "Retail",
    "Energy",
    "Other",
]

SENIORITY_LEVELS = ["Junior", "Confirmed", "Senior", "Expert"]


class StructuredMission(BaseModel):
    skills: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    domain: str = "Other"
    seniority: Optional[str] = None  # None if not inferable from text
    raw_mission_text: str


MISSION_EXTRACTION_PROMPT = """You are extracting structured recruitment criteria from a mission description.

Return ONLY valid JSON, no markdown, no preamble. Schema:
{{
  "skills": [list of specific technologies, tools, frameworks, or named methodologies EXPLICITLY written in the text],
  "certifications": [list of certifications explicitly mentioned, e.g. "AWS Certified", "PMP"],
  "domain": one of {domains},
  "seniority": one of {seniorities} or null if not determinable from the text
}}

Rules:
- skills: ONLY extract items that are literally named in the text (e.g. "Python", "AWS", "Spring Boot").
  Do NOT extract generic category labels like "Cloud", "Big Data", "Data Engineering", "Business Analysis" —
  these are domains or job-title words, not skills. If no specific named technology/tool appears, return an empty list.
- Do NOT infer skills from the job title, domain, or general context. Only explicit named terms count.
- certifications: known certifications in our database use these exact names — if the text refers to one
  of these (even loosely, e.g. "certification AWS" -> "AWS Certified Solutions Architect"), use the exact
  spelling from this list instead of inventing your own wording:
  {known_certifications}
  If the text mentions a certification NOT in this list, extract it as written.
- If seniority is not stated or implied (e.g. via years of experience mentioned), return null.
- domain must be picked from the closed list, using "Other" if none fit.
Return ONLY ONE JSON OBJECT.

The root element must be a JSON object.
Never return a JSON array.
Never return multiple alternatives.
If the input contains multiple possible interpretations, choose the single most likely interpretation.

Mission description:
\"\"\"
{mission_text}
\"\"\"

JSON:"""


def build_extraction_prompt(mission_text: str, known_certifications: list[str] | None = None) -> str:
    certs_str = ", ".join(known_certifications) if known_certifications else "(none available)"
    return MISSION_EXTRACTION_PROMPT.format(
        domains=DOMAIN_TAXONOMY,
        seniorities=SENIORITY_LEVELS,
        known_certifications=certs_str,
        mission_text=mission_text,
    )


def parse_mission_extraction(raw_response: str, mission_text: str) -> StructuredMission:
    """
    Parses Gemini's JSON output into a StructuredMission.
    Falls back to safe defaults on parse failure rather than raising,
    so a bad extraction never blocks the matching pipeline.
    """
    cleaned = raw_response.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("Mission extraction JSON parse failed, using empty structure")
        return StructuredMission(raw_mission_text=mission_text)

    domain = data.get("domain") or "Other"
    if domain not in DOMAIN_TAXONOMY:
        domain = "Other"

    seniority = data.get("seniority")
    if seniority not in SENIORITY_LEVELS:
        seniority = None

    raw_skills = data.get("skills", []) or []
    normalized_skills = normalize_skill_list(raw_skills)

    return StructuredMission(
        skills=normalized_skills,
        certifications=data.get("certifications", []) or [],
        domain=domain,
        seniority=seniority,
        raw_mission_text=mission_text,
    )


def extract_mission_structure(
    mission_text: str,
    llm_client,
    known_certifications: list[str] | None = None,
) -> StructuredMission:
    """
    Main entry point. llm_client must expose a `.generate(prompt: str) -> str`
    method — matches the google.genai wrapper used in cv_json_builder.py.

    known_certifications: pass CandidateService.get_distinct_certifications()
    to ground certification extraction against your actual DB values.
    """
    prompt = build_extraction_prompt(mission_text, known_certifications)
    raw_response = llm_client.generate(prompt)
    print(raw_response)
    return parse_mission_extraction(raw_response, mission_text)