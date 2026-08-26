import type {
  UploadResponse,
  UploadResultItem,
  UploadErrorItem,
  MatchResponse,
  MatchCandidate,
  CandidateSummary,
  AdvancedSearchResponse,
  SuggestResponse,
  CandidateDetail,
  RankedResponse,
  ExperienceItem,
  ProjectItem,
  GenerationResponse,
  ScoreResponse,
} from "./types";

const BASE = "/";

async function handle<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string };
  if ("error" in data && data.error) {
    throw new Error(data.error);
  }
  return data as T;
}

export async function uploadCVs(files: File[]): Promise<UploadResponse> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const res = await fetch(`${BASE}cv/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return handle<UploadResponse>(res);
}

export async function matchMission(missionText: string): Promise<MatchResponse> {
  const res = await fetch(`${BASE}candidates/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mission_text: missionText }),
  });
  if (!res.ok) throw new Error(`Match failed: ${res.status}`);
  return handle<MatchResponse>(res);
}

export async function searchCandidatesByName(name: string): Promise<CandidateSummary[]> {
  const res = await fetch(`${BASE}candidates?name=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const data = await handle<{ candidates: CandidateSummary[] }>(res);
  return data.candidates;
}

export async function getCountriesOptions(): Promise<string[]> {
  const res = await fetch(`${BASE}candidates/options/countries`);
  if (!res.ok) throw new Error(`Options failed: ${res.status}`);
  const data = await handle<{ countries: string[] }>(res);
  return data.countries;
}

export async function advancedSearch(payload: Record<string, unknown>): Promise<CandidateSummary[]> {
  const res = await fetch(`${BASE}candidates/search-advanced`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const data = await handle<AdvancedSearchResponse>(res);
  return data.data;
}

export async function suggestSkills(q: string, limit = 10): Promise<string[]> {
  const res = await fetch(`${BASE}candidates/suggest/skills?q=${encodeURIComponent(q)}&limit=${limit}`);
  if (!res.ok) throw new Error(`Suggest failed: ${res.status}`);
  const data = await handle<SuggestResponse>(res);
  return data.suggestions;
}

export async function getCandidateDetail(candidateId: string): Promise<CandidateDetail> {
  const res = await fetch(`${BASE}candidates/${encodeURIComponent(candidateId)}`);
  if (!res.ok) throw new Error(`Detail failed: ${res.status}`);
  return handle<CandidateDetail>(res);
}

export async function deleteCandidate(candidateId: string): Promise<{ candidate_id: string; deleted_from_candidatesV2: boolean; deleted_from_merged_candidates: boolean }> {
  const res = await fetch(`${BASE}candidates/${encodeURIComponent(candidateId)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
  return handle<{ candidate_id: string; deleted_from_candidatesV2: boolean; deleted_from_merged_candidates: boolean }>(res);
}

export async function updateCandidateName(candidateId: string, name: string): Promise<{ candidate_id: string; name: string }> {
  const res = await fetch(`${BASE}candidates/${encodeURIComponent(candidateId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Update failed: ${res.status}`);
  return handle<{ candidate_id: string; name: string }>(res);
}

export async function getRankedExperiencesAndProjects(candidateId: string, missionText: string): Promise<RankedResponse> {
  const res = await fetch(`${BASE}cv/${encodeURIComponent(candidateId)}/experiences-ranked`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mission_text: missionText }),
  });
  if (!res.ok) throw new Error(`Ranking failed: ${res.status}`);
  return handle<RankedResponse>(res);
}

export async function generateAdaptedCV(
  missionText: string,
  targetLanguage: string,
  candidates: { candidate_id: string; selected_experience_indices: number[]; selected_project_indices: number[] }[],
  mergeIntoOneDocument = false,
  outputFormat: "pptx" | "docx" = "pptx"
): Promise<GenerationResponse> {
  const res = await fetch(`${BASE}generation/cv`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mission_text: missionText,
      target_language: targetLanguage,
      candidates,
      merge_into_one_document: mergeIntoOneDocument,
      output_format: outputFormat,
    }),
  });
  if (!res.ok) throw new Error(`Generation failed: ${res.status}`);
  return handle<GenerationResponse>(res);
}
export async function scoreCandidateForMission(candidateId: string, missionText: string): Promise<ScoreResponse> {
  const res = await fetch(`${BASE}candidates/${encodeURIComponent(candidateId)}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mission_text: missionText }),
  });
  if (!res.ok) throw new Error(`Score failed: ${res.status}`);
  return handle<ScoreResponse>(res);
}

export async function suggestCertifications(q: string, limit = 10): Promise<string[]> {
  const res = await fetch(`${BASE}candidates/suggest/certifications?q=${encodeURIComponent(q)}&limit=${limit}`);
  if (!res.ok) throw new Error(`Suggest failed: ${res.status}`);
  const data = await handle<SuggestResponse>(res);
  return data.suggestions;
}



