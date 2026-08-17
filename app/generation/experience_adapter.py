# file: app/generation/experience_adapter.py
"""
app/generation/experience_adapter.py

Adapts the wording of selected experiences/projects to a target mission,
using the same Gemini client pattern as app/extraction/llm_extractor_gemini.py.

Scope, deliberately narrow:
  - Only rewrites "description" and "responsibilities[].description" of
    experiences/projects the user has ALREADY selected (post-review step,
    see get_ranked_experiences/get_ranked_projects) -- never touches static
    sections (skills, education, ...) or unselected items.
  - Never persisted to Mongo -- this is computed on demand for one
    (candidate, mission) pair, not stored as if it were the candidate's
    real data.
  - Style/emphasis only. The prompt explicitly forbids introducing any
    technology, tool, company, or responsibility not already present in the
    source text -- the main risk with LLM rewriting is embellishment, not
    grammar.

Fidelity guard: after generation, every technology already listed in
exp["technologies"] is checked for presence (case-insensitive substring)
somewhere in the adapted text. This only catches OMISSION, not addition --
detecting hallucinated NEW technologies would require a full technology
vocabulary to check against, which doesn't exist. The prompt constraint is
the primary defense against hallucination; this check is a lightweight
secondary signal, not a guarantee.
"""

import time

from app.extraction.llm_extractor_gemini import client, _parse_response

MODEL_NAME = "gemini-3.1-flash-lite"


def _build_prompt(items: list[dict], mission_text: str, target_language: str, item_kind: str) -> str:
    """
    items: list of {"index": int, "title_or_name": str, "company": str|None,
                     "description": str, "responsibilities": list[dict]}
    item_kind: "experience" or "project" -- only affects wording in the prompt.
    """
    lines = [
        f"You are adapting the wording of a candidate's {item_kind}s to better match a target mission.",
        "",
        "STRICT RULES:",
        "- Rewrite ONLY the style, phrasing, and emphasis to align with the mission's vocabulary.",
        "- NEVER invent, add, or imply any technology, tool, company, responsibility, or fact that is",
        "  not already present in the original text below. If something isn't mentioned in the source,",
        "  it must not appear in your rewrite.",
        "- Do not change dates, company names, or job titles.",
        f"- Write the output in {target_language}.",
        "- Return ONLY valid JSON matching the schema below, no markdown, no commentary.",
        "",
        f"TARGET MISSION:\n{mission_text}",
        "",
        f"{item_kind.upper()}S TO ADAPT:",
    ]

    for it in items:
        lines.append(f"\n[index={it['index']}]")
        if it.get("title_or_name"):
            lines.append(f"Title: {it['title_or_name']}")
        if it.get("company"):
            lines.append(f"Company: {it['company']}")
        lines.append(f"Original description: {it.get('description') or '(none)'}")
        if it.get("responsibilities"):
            resp_text = "; ".join(
                r.get("description") or r.get("category") or ""
                for r in it["responsibilities"] if isinstance(r, dict)
            )
            lines.append(f"Original responsibilities: {resp_text}")

    lines.append(
        "\n\nReturn JSON in this exact shape:\n"
        '{"adapted_items": [{"index": <int>, "adapted_description": "...", '
        '"adapted_responsibilities": [{"category": "...", "description": "..."}]}]}'
    )

    return "\n".join(lines)


def _check_technology_fidelity(original_technologies: list[str], adapted_text: str) -> list[str]:
    """Return the subset of original_technologies NOT found (case-insensitive
    substring) in adapted_text -- signals possible omission, logged only."""
    adapted_lower = adapted_text.lower()
    return [t for t in original_technologies if t and t.lower() not in adapted_lower]


def adapt_selected_experiences(
    experiences: list[dict], mission_text: str, target_language: str = "English"
) -> dict[int, dict]:
    """
    experiences: list of full experience dicts (as stored in merged_candidates),
    each expected to carry its own "experience_index" (attach it before calling
    if not already present -- see build_matched_cv_json's resolved items).

    Returns {experience_index: {"description": str, "responsibilities": list[dict]}}
    for every experience successfully adapted. Items that fail to parse are
    silently skipped (original text should be used as fallback by the caller).
    """
    if not experiences:
        return {}

    items = [
        {
            "index": exp["experience_index"],
            "title_or_name": exp.get("title"),
            "company": exp.get("company"),
            "description": exp.get("description"),
            "responsibilities": exp.get("responsibilities") or [],
        }
        for exp in experiences
    ]

    prompt = _build_prompt(items, mission_text, target_language, item_kind="experience")

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
        config={"response_mime_type": "application/json", "max_output_tokens": 4000},
    )
    data = _parse_response(response, key="adapted_items")

    result = {}
    for adapted in data.get("adapted_items", []):
        if not isinstance(adapted, dict) or "index" not in adapted:
            continue
        idx = adapted["index"]
        result[idx] = {
            "description": adapted.get("adapted_description", ""),
            "responsibilities": adapted.get("adapted_responsibilities", []),
        }

        # Fidelity check (log only, doesn't block or auto-correct)
        original = next((e for e in experiences if e["experience_index"] == idx), None)
        if original:
            missing = _check_technology_fidelity(
                original.get("technologies") or [], result[idx]["description"]
            )
            if missing:
                print(f"[experience_adapter] WARNING exp_index={idx}: "
                      f"technologies present in original but not in adapted text: {missing}")

    time.sleep(1)
    return result


def adapt_selected_projects(
    projects: list[dict], mission_text: str, target_language: str = "English"
) -> dict[int, dict]:
    """Same as adapt_selected_experiences, for projects. Returns
    {project_index: {"description": str}} (projects have no responsibilities)."""
    if not projects:
        return {}

    items = [
        {
            "index": proj["project_index"],
            "title_or_name": proj.get("name"),
            "company": None,
            "description": proj.get("description"),
            "responsibilities": [],
        }
        for proj in projects
    ]

    prompt = _build_prompt(items, mission_text, target_language, item_kind="project")

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
        config={"response_mime_type": "application/json", "max_output_tokens": 3000},
    )
    data = _parse_response(response, key="adapted_items")

    result = {}
    for adapted in data.get("adapted_items", []):
        if not isinstance(adapted, dict) or "index" not in adapted:
            continue
        idx = adapted["index"]
        result[idx] = {"description": adapted.get("adapted_description", "")}

        original = next((p for p in projects if p["project_index"] == idx), None)
        if original:
            missing = _check_technology_fidelity(
                original.get("technologies") or [], result[idx]["description"]
            )
            if missing:
                print(f"[experience_adapter] WARNING proj_index={idx}: "
                      f"technologies present in original but not in adapted text: {missing}")

    time.sleep(1)
    return result


def translate_summary(summary: str, target_language: str = "English") -> str:
    """Straight translation of the free-text summary, no mission context."""
    if not summary:
        return summary

    prompt = (
        f"Translate the following candidate CV summary into {target_language}. "
        "Preserve all facts, numbers, and technical terms exactly -- do not "
        "add, remove, or embellish anything. Return ONLY the translated text, "
        "no commentary, no quotes.\n\n"
        f"SUMMARY:\n{summary}"
    )
    response = client.models.generate_content(model=MODEL_NAME, contents=prompt)
    translated = (response.text or "").strip()
    return translated or summary

def translate_selected_experiences(experiences: list[dict], target_language: str = "English") -> dict[int, dict]:
    """
    Straight translation (no mission alignment) of selected experiences --
    used when no mission_text is provided, so the candidate's language
    preference is still honored.
    """
    if not experiences:
        return {}

    items = [
        {
            "index": exp["experience_index"],
            "title_or_name": exp.get("title"),
            "company": exp.get("company"),
            "description": exp.get("description"),
            "responsibilities": exp.get("responsibilities") or [],
        }
        for exp in experiences
    ]

    lines = [
        f"Translate the following candidate experiences into {target_language}.",
        "Preserve all facts, dates, company names, and technical terms exactly --",
        "this is a translation, not a rewrite. Do not add, remove, or embellish anything.",
        "Return ONLY valid JSON matching the schema below, no markdown, no commentary.",
        "\nEXPERIENCES TO TRANSLATE:",
    ]
    for it in items:
        lines.append(f"\n[index={it['index']}]")
        if it.get("title_or_name"):
            lines.append(f"Title: {it['title_or_name']}")
        if it.get("company"):
            lines.append(f"Company: {it['company']}")
        lines.append(f"Description: {it.get('description') or '(none)'}")
        if it.get("responsibilities"):
            resp_text = "; ".join(
                r.get("description") or r.get("category") or ""
                for r in it["responsibilities"] if isinstance(r, dict)
            )
            lines.append(f"Responsibilities: {resp_text}")

    lines.append(
        "\n\nReturn JSON in this exact shape:\n"
        '{"adapted_items": [{"index": <int>, "adapted_description": "...", '
        '"adapted_responsibilities": [{"category": "...", "description": "..."}]}]}'
    )

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents="\n".join(lines),
        config={"response_mime_type": "application/json", "max_output_tokens": 4000},
    )
    data = _parse_response(response, key="adapted_items")

    result = {}
    for adapted in data.get("adapted_items", []):
        if not isinstance(adapted, dict) or "index" not in adapted:
            continue
        idx = adapted["index"]
        result[idx] = {
            "description": adapted.get("adapted_description", ""),
            "responsibilities": adapted.get("adapted_responsibilities", []),
        }

    time.sleep(1)
    return result