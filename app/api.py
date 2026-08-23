# file: app/api.py
"""
app/api.py

FastAPI layer over the CV platform pipeline.

Main flows:
1. Upload -> POST /cv/upload (single or multiple files).
2. Mission matching + selection ->
   POST /candidates/match           mission text -> relevant candidates (id, name, score)
   GET  /candidates                 non-semantic search: by name and/or section filter
   GET  /candidates/filters/{section}  distinct values for a section, to populate a dropdown
   POST /candidates/search-advanced multi-criteria filtering
   GET  /candidates/{candidate_id}  full consolidated candidate detail/CV
   POST /cv/{candidate_id}/experiences-ranked  experiences/projects ranked by similarity
   POST /cv/{candidate_id}/adapted-json        generates adapted CV JSON for specific or auto-selected items
   POST /generation/cv              batch-generates filled PPTX CV(s) from a user selection
   GET  /generation/cv/{candidate_id}/download  downloads a previously generated PPTX
"""

from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Query, HTTPException, Path
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import shutil
import tempfile
import os
from bson import ObjectId

from app.services.candidate_service import CandidateService
from app.extraction.pipeline import extract_and_store_cv
from app.generation.cv_json_builder import (
    get_ranked_experiences,
    get_ranked_projects,
    build_matched_cv_json,
)
from app.generation.experience_adapter import (
    adapt_selected_experiences,
    adapt_selected_projects,
)
from app.main_usage import (
    candidates_collection,
    merged_candidates_collection,
    sync_merged_candidate,
    index_merged_candidate,
    get_embedder,
    get_store,
    run_mission_matching,
    get_distinct_section_values,
    search_candidates,
    delete_candidate,
    update_candidate_name,
    generate_cv_from_selection,
    generate_docx_from_selection,
    GENERATED_CV_DIR,
)







# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class MissionRequest(BaseModel):
    mission_text: str
    target_language: str = "French"


class CustomSelectionAdaptRequest(BaseModel):
    mission_text: str
    target_language: str = "French"
    selected_experience_indices: Optional[list[int]] = None
    selected_project_indices: Optional[list[int]] = None


class SelectedCandidate(BaseModel):
    candidate_id: str
    selected_experience_indices: list[int] = []
    selected_project_indices: list[int] = []


class UpdateNameRequest(BaseModel):
    name: str


class GenerationRequest(BaseModel):
    # None = no LLM wording adaptation, experiences are inserted as-is.
    mission_text: Optional[str] = None
    target_language: str = "French"
    candidates: list[SelectedCandidate]


class AdvancedSearchRequest(BaseModel):
    skills: Optional[list[str]] = None
    skills_match_all: bool = False
    countries: Optional[list[str]] = None
    company: Optional[str] = None
    job_title: Optional[str] = None
    certifications: Optional[list[str]] = None
    languages: Optional[list[str]] = None
    degree: Optional[str] = None
    page: int = 1
    limit: int = 20

class GenerationRequest(BaseModel):
    mission_text: Optional[str] = None
    target_language: str = "French"
    candidates: list[SelectedCandidate]
    merge_into_one_document: bool = False    


#Health check endpoint
_backend_ready = False

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[startup] Chargement du modèle SBERT et de ChromaDB...")
    get_embedder()
    get_store()
    global _backend_ready
    _backend_ready = True
    print("[startup] Prêt.")
    yield




app = FastAPI(title="CV Platform API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

candidate_service = CandidateService(merged_candidates_collection)
@app.get("/health")
async def health():
    return {"ready": _backend_ready}


# ---------------------------------------------------------------------------
# 1. Upload
# ---------------------------------------------------------------------------

def _store_and_merge_one(tmp_path: str, original_filename: str) -> dict:
    try:
        candidate = extract_and_store_cv(tmp_path, candidates_collection=candidates_collection)
        candidate_id = str(candidate["_id"])

        merged = sync_merged_candidate(candidate_id)

        return {
            "filename": original_filename,
            "candidate_id": candidate_id,
            "name": candidate.get("name"),
            "email": candidate.get("email"),
            "status": candidate.get("_pipeline_status"),
            "version": candidate.get("_pipeline_version"),
            "experience_count_after_merge": len(merged.get("experience", [])) if merged else 0,
        }
    except Exception as e:
        return {"filename": original_filename, "error": f"{type(e).__name__}: {e}"}


@app.post("/cv/upload-single")
async def upload_cv_single(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    result = _store_and_merge_one(tmp_path, file.filename)
    os.remove(tmp_path)
    return result


@app.post("/cv/upload")
async def upload_cv(files: list[UploadFile] = File(...)):
    results = []
    for file in files:
        suffix = os.path.splitext(file.filename)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name

        results.append(_store_and_merge_one(tmp_path, file.filename))
        os.remove(tmp_path)

    return {"results": results}


# ---------------------------------------------------------------------------
# 2. Mission matching
# ---------------------------------------------------------------------------

@app.post("/candidates/match")
async def match_mission(request: MissionRequest):
    """Scan stored candidates against mission text and rank them."""
    relevant = run_mission_matching(request.mission_text)
    return {"candidates": relevant}


# ---------------------------------------------------------------------------
# 2a. Candidate searches and filters
# ---------------------------------------------------------------------------

@app.get("/candidates")
async def list_candidates(
    name: Optional[str] = Query(None, description="Case-insensitive substring match on candidate name"),
    section: Optional[str] = Query(None, description="Section to filter on, e.g. 'skills'"),
    values: Optional[str] = Query(None, description="Comma-separated values to match in that section"),
):
    value_list = [v.strip() for v in values.split(",")] if values else None

    try:
        candidates = search_candidates(name=name, section=section, values=value_list)
    except ValueError as e:
        return {"error": str(e)}

    return {"candidates": candidates}


@app.get("/candidates/filters/{section}")
async def get_section_filter_values(section: str):
    try:
        values = get_distinct_section_values(section)
    except ValueError as e:
        return {"error": str(e)}

    return {"section": section, "values": values}


@app.get("/candidates/options/all")
async def get_all_filter_options():
    return candidate_service.get_all_filter_options()


@app.get("/candidates/options/skills")
async def get_skills_options():
    return {"skills": candidate_service.get_distinct_skills()}


@app.get("/candidates/options/countries")
async def get_countries_options():
    return {"countries": candidate_service.get_distinct_countries()}


@app.get("/candidates/options/job-titles")
async def get_job_titles_options():
    return {"job_titles": candidate_service.get_distinct_job_titles()}


@app.get("/candidates/suggest/skills")
async def suggest_skills(
    q: str = Query(..., min_length=1, description="Préfixe recherché"),
    limit: int = Query(10, ge=1, le=50)
):
    suggestions = candidate_service.suggest_skills(prefix=q, limit=limit)
    return {"query": q, "suggestions": suggestions}


@app.get("/candidates/suggest/companies")
async def suggest_companies(
    q: str = Query(..., min_length=1, description="Préfixe recherché"),
    limit: int = Query(10, ge=1, le=50)
):
    suggestions = candidate_service.suggest_companies(prefix=q, limit=limit)
    return {"query": q, "suggestions": suggestions}


@app.get("/candidates/suggest/job-titles")
async def suggest_job_titles(
    q: str = Query(..., min_length=1, description="Préfixe recherché"),
    limit: int = Query(10, ge=1, le=50)
):
    suggestions = candidate_service.suggest_job_titles(prefix=q, limit=limit)
    return {"query": q, "suggestions": suggestions}


@app.post("/candidates/search-advanced")
async def search_candidates_advanced(request: AdvancedSearchRequest):
    filters = request.model_dump(exclude={"page", "limit"})
    return candidate_service.filter_candidates(
        filters=filters,
        page=request.page,
        limit=request.limit
    )


@app.get("/candidates/{candidate_id}")
async def get_candidate_cv(candidate_id: str = Path(..., description="MongoDB _id or candidate_id")):
    candidate_cv = candidate_service.get_candidate_by_id(candidate_id)
    if not candidate_cv:
        raise HTTPException(status_code=404, detail=f"Aucun candidat trouvé pour ID='{candidate_id}'")
    return candidate_cv


@app.delete("/candidates/{candidate_id}")
async def delete_candidate_endpoint(candidate_id: str):
    try:
        result = delete_candidate(candidate_id)
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"}
    return result


@app.put("/candidates/{candidate_id}")
async def update_candidate_name_endpoint(candidate_id: str, request: UpdateNameRequest):
    try:
        result = update_candidate_name(candidate_id, request.name)
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"}
    return result


# ---------------------------------------------------------------------------
# 2b. Per-candidate ranked experiences and adapted JSON generation
# ---------------------------------------------------------------------------

@app.post("/cv/{candidate_id}/experiences-ranked")
async def get_ranked_experiences_and_projects(candidate_id: str, request: MissionRequest):
    """Every experience/project ranked by similarity to a mission."""
    merged = sync_merged_candidate(candidate_id)
    if not merged:
        return {"error": f"Candidat introuvable pour candidate_id='{candidate_id}'"}

    index_merged_candidate(merged)

    query_vec = get_embedder().model.encode(request.mission_text).tolist()
    store = get_store()

    experiences = get_ranked_experiences(store, merged_candidates_collection, candidate_id, query_vec)
    projects = get_ranked_projects(store, merged_candidates_collection, candidate_id, query_vec)

    return {"experiences": experiences, "projects": projects}


@app.post("/cv/{candidate_id}/adapted-json")
async def generate_adapted_cv_json(candidate_id: str, request: CustomSelectionAdaptRequest):
    """
    Builds and adapts the CV JSON for a candidate given a target mission.
    Supports either automatic semantic retrieval or explicit experience/project index selections.
    """
    candidate = merged_candidates_collection.find_one({"candidate_id": ObjectId(candidate_id)})
    if not candidate:
        raise HTTPException(status_code=404, detail=f"Candidat non trouvé pour ID='{candidate_id}'")

    # Mode 1 : Sélection personnalisée par l'utilisateur
    if request.selected_experience_indices is not None or request.selected_project_indices is not None:
        result = {}
        STATIC_SECTIONS = [
            "summary", "skills", "expertise_areas", "functional_skills",
            "education", "languages", "certifications",
            "countries_worked", "professional_affiliations",
        ]
        for section in STATIC_SECTIONS:
            if candidate.get(section):
                result[section] = candidate[section]

        # Récupération et préparation des expériences choisies
        sel_exp_indices = set(request.selected_experience_indices or [])
        raw_exp_list = candidate.get("experience") or []
        selected_exps = []
        for idx, exp in enumerate(raw_exp_list):
            if idx in sel_exp_indices:
                item = dict(exp)
                item["experience_index"] = idx
                selected_exps.append(item)

        # Récupération et préparation des projets choisis
        sel_proj_indices = set(request.selected_project_indices or [])
        raw_proj_list = candidate.get("projects") or []
        selected_projs = []
        for idx, proj in enumerate(raw_proj_list):
            if idx in sel_proj_indices:
                item = dict(proj)
                item["project_index"] = idx
                selected_projs.append(item)

        # Adaptation via Gemini
        if selected_exps:
            adapted_exp_map = adapt_selected_experiences(
                selected_exps, request.mission_text, request.target_language
            )
            for exp in selected_exps:
                idx = exp["experience_index"]
                if idx in adapted_exp_map:
                    if adapted_exp_map[idx].get("description"):
                        exp["description"] = adapted_exp_map[idx]["description"]
                    if adapted_exp_map[idx].get("responsibilities"):
                        exp["responsibilities"] = adapted_exp_map[idx]["responsibilities"]

        if selected_projs:
            adapted_proj_map = adapt_selected_projects(
                selected_projs, request.mission_text, request.target_language
            )
            for proj in selected_projs:
                idx = proj["project_index"]
                if idx in adapted_proj_map and adapted_proj_map[idx].get("description"):
                    proj["description"] = adapted_proj_map[idx]["description"]

        if selected_exps:
            result["experience"] = selected_exps
        if selected_projs:
            result["projects"] = selected_projs

        return {"candidate_id": candidate_id, "cv_json": result}

    # Mode 2 : Sélection automatique via recherche sémantique
    query_vec = get_embedder().model.encode(request.mission_text).tolist()
    cv_json = build_matched_cv_json(
        get_store(),
        merged_candidates_collection,
        candidate_id,
        query_vec,
        mission_text=request.mission_text,
        target_language=request.target_language,
    )
    return {"candidate_id": candidate_id, "cv_json": cv_json}


# ---------------------------------------------------------------------------
# 3. CV generation (PPTX template)
# ---------------------------------------------------------------------------

@app.post("/generation/cv")
async def generate_cv(request: GenerationRequest):
    """
    Generates one filled PPTX per candidate in the batch. Returns, per
    candidate, either a download_url (status "ok") or an error message
    (status "error") -- callers should check status per-item, not rely on
    the endpoint itself failing.
    """
    return generate_cv_from_selection(request.model_dump())


@app.get("/generation/cv/{candidate_id}/download")
async def download_generated_cv(candidate_id: str):
    path = os.path.join(GENERATED_CV_DIR, f"{candidate_id}.pptx")
    if not os.path.exists(path):
        raise HTTPException(
            status_code=404,
            detail="CV non généré : appelez POST /generation/cv d'abord.",
        )
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename=f"CV_{candidate_id}.pptx",
    )
@app.post("/generation/cv-docx")
async def generate_cv_docx(request: GenerationRequest):
    """
    Generates one filled DOCX CV per selected candidate
    using the supervisor's Word template.
    """
    return generate_docx_from_selection(request.model_dump())


@app.get("/generation/cv-docx/{candidate_id}/download")
async def download_generated_cv_docx(candidate_id: str):
    path = os.path.join(
        GENERATED_CV_DIR,
        f"{candidate_id}.docx"
    )

    if not os.path.exists(path):
        raise HTTPException(
            status_code=404,
            detail="CV DOCX non généré : appelez POST /generation/cv-docx d'abord.",
        )

    return FileResponse(
        path,
        media_type=(
            "application/vnd.openxmlformats-officedocument"
            ".wordprocessingml.document"
        ),
        filename=f"CV_{candidate_id}.docx",
    )
@app.get("/generation/download/{filename}")
async def download_generated_file(filename: str):
    # filename is server-generated (batch_<uuid>.zip / merged_<uuid>.pptx) --
    # no user input reaches the filesystem path beyond this basename check.
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")
    path = os.path.join(GENERATED_CV_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Fichier introuvable ou expiré.")
    media_type = (
        "application/zip" if filename.endswith(".zip")
        else "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    )
    return FileResponse(path, media_type=media_type, filename=filename)