# file: app/matching/run_mission_matching.py
"""
Multi-criteria version of run_mission_matching: adds skills and
certifications coverage on top of the existing SBERT experience score,
combined via compute_global_score. Experience-matching logic itself
(is_candidate_relevant_v2, Pass A thresholds, etc.) is untouched.
"""

from .mission_extractor import extract_mission_structure, StructuredMission
from .skills_matching import compute_skill_coverage
from .certifications_matching import compute_certification_coverage
from .global_score import compute_global_score

from app.generation.cv_json_builder import is_candidate_relevant_v2
from app.main_usage import (
    get_embedder,
    get_store,
    sync_merged_candidate,
    index_merged_candidate,
    candidates_collection,
)


def run_mission_matching_v2(
    mission_text: str,
    llm_client,
    candidate_service,
) -> list[dict]:
    print("[matching] Extraction structurée de la mission...")
    known_certifications = candidate_service.get_distinct_certifications()
    structured_mission: StructuredMission = extract_mission_structure(
        mission_text, llm_client, known_certifications
    )
    print(f"    -> skills: {structured_mission.skills}")
    print(f"    -> certifications: {structured_mission.certifications}")
    print(f"    -> domain: {structured_mission.domain}")

    print("[matching] Embedding de la mission...")
    query_vec = get_embedder().model.encode(mission_text).tolist()

    total = candidates_collection.count_documents({})
    relevant = []

    for i, candidate in enumerate(candidates_collection.find({}), start=1):
        name = candidate.get("name", "?")
        candidate_id = str(candidate["_id"])

        print(f"[{i}/{total}] {name}...")
        merged = sync_merged_candidate(candidate_id)
        if not merged:
            print("    -> aucune version exploitable, ignoré.")
            continue

        index_merged_candidate(merged)

        is_relevant, avg_score = is_candidate_relevant_v2(
            store=get_store(),
            query_vec=query_vec,
            candidate_id=candidate_id,
        )
        print(f"    -> pertinent : {is_relevant} (score moyen: {avg_score}%)")

        if not is_relevant:
            continue

        # distance_to_score() returns 0-100 -- normalize to 0-1 to match
        # skill/cert coverage ratios before combining in compute_global_score.
        experience_score = avg_score / 100

        skill_coverage = compute_skill_coverage(
            structured_mission.skills, merged.get("skills", [])
        )
        cert_coverage = compute_certification_coverage(
            structured_mission.certifications, merged.get("certifications", [])
        )

        global_result = compute_global_score(
            experience_score=experience_score,
            skill_score=skill_coverage.score,
            certification_score=cert_coverage.score,
        )

        relevant.append({
            "candidate_id": candidate_id,
            "name": name,
            "email": candidate.get("email"),
            "avg_score": avg_score,  # raw 0-100, for display/backward compat
            "global_score": global_result.global_score,  # 0-1, combined multi-criteria
            "breakdown": global_result.breakdown,
            "skill_matched": skill_coverage.matched,
            "skill_missing": skill_coverage.missing,
            "cert_matched": cert_coverage.matched,
            "cert_missing": cert_coverage.missing,
        })

    relevant.sort(key=lambda c: c["global_score"], reverse=True)

    print(f"\n{'#' * 60}")
    print(f"{len(relevant)} candidat(s) pertinent(s) sur {total}")
    print(f"{'#' * 60}")

    return relevant