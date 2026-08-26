export type ScoreResponse = {
  candidate_id: string;
  avg_score: number;
  is_relevant: boolean;
};


export type UploadResultItem = {
  filename: string;
  candidate_id: string;
  name: string | null;
  email: string | null;
  status: "new_candidate" | "new_version" | "duplicate";
  version: number;
  experience_count_after_merge: number;
};

export type UploadErrorItem = {
  filename: string;
  error: string;
};

export type UploadResponse = {
  results: (UploadResultItem | UploadErrorItem)[];
};

export type MatchCandidate = {
  candidate_id: string;
  name: string;
  email: string | null;
  avg_score: number;
  global_score: number;
  breakdown: Record<string, { score: number; weight_used: number }>;
  skill_matched: string[];
  skill_missing: string[];
  cert_matched: string[];
  cert_missing: string[];
};

export type MatchResponse = {
  candidates: MatchCandidate[];
};

export type CandidateSummary = {
  candidate_id: string;
  name: string;
  email: string | null;
};

export type AdvancedSearchResponse = {
  data: CandidateSummary[];
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

export type SuggestResponse = {
  suggestions: string[];
};

export type ExperienceItem = {
  experience_index: number;
  item: Record<string, unknown>;
  score: number;
  auto_selected: boolean;
};

export type ProjectItem = {
  project_index: number;
  item: Record<string, unknown>;
  score: number;
  auto_selected: boolean;
};

export type RankedResponse = {
  experiences: ExperienceItem[];
  projects: ProjectItem[];
};

export type GenerationResultItem =
  | { candidate_id: string; status: "ok"; download_url: string }
  | { candidate_id: string; status: "error"; message: string };

export type GenerationResponse = {
  results: GenerationResultItem[];
  zip_download_url?: string;
  merged_download_url?: string;
  merge_error?: string;
};

export type CandidateDetail = Record<string, unknown>;

export type SelectionEntry = {
  candidate_id: string;
  name: string;
  email: string | null;
  source: "matching" | "search";
};

export type CandidateSelection = SelectionEntry & {
  selected_experience_indices: Set<number>;
  selected_project_indices: Set<number>;
};

export type Step = "cv_management" | "matching" | "review" | "generation";

export type Candidate = {
  id: string;
  name: string;
  role: string;
  match: number;
  country: string;
  experience: string;
  skills: string[];
  languages: string[];
  summary: string;
  added: string;
  education: string[];
  projects: string[];
  certifications: string[];
  company: string;
};
export type OutputFormat = "pptx" | "docx";