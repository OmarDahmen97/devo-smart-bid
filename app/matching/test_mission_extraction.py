# file: app/matching/test_mission_extraction.py
"""
Test script for mission_extractor.py against real Gemini calls.

ADAPT: replace GeminiClient below with your existing Gemini wrapper
from cv_json_builder.py (same client used for CV adaptation) —
this is a placeholder using google.generativeai directly.
"""

import os
from dotenv import load_dotenv
from google import genai
from pymongo import MongoClient

from .mission_extractor import extract_mission_structure, StructuredMission
from .skills_matching import compute_skill_coverage
from .certifications_matching import compute_certification_coverage

load_dotenv()


class GeminiClient:
    """Matches the client used in cv_json_builder.py."""

    def __init__(self, model_name: str = "gemini-3.1-flash-lite"):
        gemini_key = os.getenv("GEMINI_API_KEY")
        self.client = genai.Client(api_key=gemini_key)
        self.model_name = model_name

    def generate(self, prompt: str) -> str:
        response = self.client.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "max_output_tokens": 2000,
            },
        )
        return response.text


TEST_MISSIONS = [
    {
        "label": "Data Engineer - Banque - implicite",
        "text": (
            "Recherche Data Engineer pour intervenir sur des projets Big Data "
            "dans un environnement Cloud bancaire."
        ),
        "expected_domain": "Banking",
    },
    {
        "label": "Dev Java explicite avec certif",
        "text": (
            "Nous recherchons un Développeur Java Senior (7+ ans d'expérience) "
            "pour un projet dans le secteur assurance. Certification AWS Solutions "
            "Architect appréciée. Stack: Java, Spring Boot, Kafka, PostgreSQL."
        ),
        "expected_domain": "Insurance",
    },
    {
        "label": "Mission vague sans séniorité ni skills clairs",
        "text": "Consultant fonctionnel pour accompagner une transformation digitale.",
        "expected_domain": "Other",
    },
    {
        "label": "Profil télécom junior",
        "text": (
            "Poste de Business Analyst junior (1-2 ans) pour un opérateur télécom, "
            "maîtrise d'Excel et Power BI requise."
        ),
        "expected_domain": "Telecom",
    },
]


def run_tests():
    # ADAPT: replace with your actual DB connection setup (host/db name env vars)
    mongo_uri = os.getenv("MONGODB_URI")
    db_name = os.getenv("MONGODB_DB_NAME", "cv_platform")
    mongo_client = MongoClient(mongo_uri)
    collection = mongo_client[db_name]["merged_candidates"]

    from app.services.candidate_service import CandidateService
    candidate_service = CandidateService(collection)

    llm_client = GeminiClient()
    known_certifications = candidate_service.get_distinct_certifications()

    # Grab a handful of real candidates to test coverage against
    candidates_page = candidate_service.filter_candidates(filters={}, page=1, limit=5)
    candidate_ids = [c["_id"] for c in candidates_page["data"]]
    candidates = [candidate_service.get_candidate_by_id(cid) for cid in candidate_ids]

    for case in TEST_MISSIONS:
        print(f"\n{'=' * 60}")
        print(f"CASE: {case['label']}")
        print(f"TEXT: {case['text']}")

        result: StructuredMission = extract_mission_structure(
            case["text"], llm_client, known_certifications
        )

        print(f"  skills:         {result.skills}")
        print(f"  certifications: {result.certifications}")
        print(f"  domain:         {result.domain}  (expected: {case['expected_domain']})")
        print(f"  seniority:      {result.seniority}")

        domain_ok = result.domain == case["expected_domain"]
        print(f"  DOMAIN CHECK:   {'PASS' if domain_ok else 'FAIL'}")

        if not result.skills:
            print("  SKILL COVERAGE: skipped (no skills extracted from mission)")
            continue

        print("  --- skill coverage vs candidates ---")
        for cand in candidates:
            if not cand:
                continue
            cand_skills = cand.get("skills", []) or []
            coverage = compute_skill_coverage(result.skills, cand_skills)
            name = cand.get("name", cand.get("candidate_id", "?"))
            print(
                f"    {name}: score={coverage.score:.2f}  "
                f"matched={coverage.matched}  missing={coverage.missing}"
            )

        if not result.certifications:
            print("  CERT COVERAGE:  skipped (no certifications extracted from mission)")
            continue

        print("  --- certification coverage vs candidates ---")
        for cand in candidates:
            if not cand:
                continue
            cand_certs = cand.get("certifications", []) or []
            cert_coverage = compute_certification_coverage(result.certifications, cand_certs)
            name = cand.get("name", cand.get("candidate_id", "?"))
            print(
                f"    {name}: score={cert_coverage.score:.2f}  "
                f"matched={cert_coverage.matched}  missing={cert_coverage.missing}"
            )


if __name__ == "__main__":
    run_tests()