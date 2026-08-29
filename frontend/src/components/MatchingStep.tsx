import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Loader2, Search, Plus, X } from "lucide-react";
import { matchMission, searchCandidatesByName, advancedSearch, suggestSkills, suggestCertifications, getCountriesOptions, deleteCandidate, scoreCandidateForMission } from "../api";
import type { MatchCandidate, CandidateSummary, SelectionEntry } from "../types";
import { Eye } from "lucide-react";

type Tab = "matching" | "name" | "country" | "skill" | "certification";

export function MatchingStep({
  missionText,
  onSelectionChange,
  onViewCandidate,
}: {
  missionText: string;
  onSelectionChange: (selection: SelectionEntry[]) => void;
  onViewCandidate: (candidateId: string, name: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("matching");
  const [loading, setLoading] = useState(false);
  const [matched, setMatched] = useState<MatchCandidate[]>([]);
  const [searchResults, setSearchResults] = useState<CandidateSummary[]>([]);
  const [selected, setSelected] = useState<Map<string, SelectionEntry>>(new Map());
  const [nameQuery, setNameQuery] = useState("");
  const [countryQuery, setCountryQuery] = useState("");
  const [skillQuery, setSkillQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [error, setError] = useState("");

  const [deleteList, setDeleteList] = useState<CandidateSummary[]>([]);
  const [deleteTarget, setDeleteTarget] = useState("");

  const [nameSearched, setNameSearched] = useState(false);
  const [countrySearched, setCountrySearched] = useState(false);
  const [skillSearched, setSkillSearched] = useState(false);

  const selectedList = useMemo(() => Array.from(selected.values()), [selected]);

  const [certQuery, setCertQuery] = useState("");
  const [certTags, setCertTags] = useState<string[]>([]);
  const [certSuggestions, setCertSuggestions] = useState<string[]>([]);
  const [certSearched, setCertSearched] = useState(false);

  const addCertTag = (value: string) => {
    const clean = value.trim();
    if (!clean || certTags.includes(clean)) return;
    setCertTags((prev) => [...prev, clean]);
    setCertQuery("");
    setCertSuggestions([]);
  };

  const removeCertTag = (value: string) => {
    setCertTags((prev) => prev.filter((t) => t !== value));
  };

  const runCertSearch = async () => {
    const tags = certQuery.trim() ? [...certTags, certQuery.trim()] : certTags;
    if (tags.length === 0) return;
    setLoading(true);
    setError("");
    setCertSearched(true);
    try {
      const data = await advancedSearch({ certifications: tags, limit: 50 });
      setSearchResults(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const emit = useCallback(
    (next: Map<string, SelectionEntry>) => {
      setSelected(next);
      onSelectionChange(Array.from(next.values()));
    },
    [onSelectionChange]
  );

  const toggleMatched = useCallback(
    (c: MatchCandidate) => {
      const next = new Map(selected);
      const entry: SelectionEntry = { candidate_id: c.candidate_id, name: c.name, email: c.email, source: "matching" };
      if (next.has(c.candidate_id)) next.delete(c.candidate_id);
      else next.set(c.candidate_id, entry);
      emit(next);
    },
    [selected, emit]
  );

  const removeMany = useCallback(
    (ids: string[]) => {
      const next = new Map(selected);
      ids.forEach((id) => next.delete(id));
      emit(next);
    },
    [selected, emit]
  );


  const addSearchResultsMany = useCallback(
    (candidates: CandidateSummary[]) => {
      const next = new Map(selected);
      candidates.forEach((c) => {
        if (!next.has(c.candidate_id)) {
          next.set(c.candidate_id, { candidate_id: c.candidate_id, name: c.name, email: c.email, source: "search" });
        }
      });
      emit(next);
    },
    [selected, emit]
  );

  const addSearchResult = useCallback(
    (c: CandidateSummary) => {
      const next = new Map(selected);
      const entry: SelectionEntry = { candidate_id: c.candidate_id, name: c.name, email: c.email, source: "search" };
      if (!next.has(c.candidate_id)) {
        next.set(c.candidate_id, entry);
        emit(next);
      }
    },
    [selected, emit]
  );

  const remove = useCallback(
    (id: string) => {
      const next = new Map(selected);
      next.delete(id);
      emit(next);
    },
    [selected, emit]
  );

  const runMatch = async () => {
    if (!missionText.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await matchMission(missionText);
      setMatched(data.candidates);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Match failed");
    } finally {
      setLoading(false);
    }
  };

  const runNameSearch = async () => {
    if (!nameQuery.trim()) return;
    setLoading(true);
    setError("");
    setNameSearched(true);
    try {
      const data = await searchCandidatesByName(nameQuery);
      setSearchResults(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const runCountrySearch = async () => {
    if (!countryQuery) return;
    setLoading(true);
    setError("");
    setCountrySearched(true);
    try {
      const data = await advancedSearch({ countries: [countryQuery], limit: 50 });
      setSearchResults(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const runSkillSearch = async () => {
    if (!skillQuery.trim()) return;
    setLoading(true);
    setError("");
    setSkillSearched(true);
    try {
      const data = await advancedSearch({ skills: [skillQuery], limit: 50 });
      setSearchResults(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const loadDeleteList = async () => {
    try {
      const data = await searchCandidatesByName("");
      setDeleteList(data);
    } catch {
      setDeleteList([]);
    }
  };

  const handleDeleteSelected = async () => {
    if (!deleteTarget) return;
    const target = deleteList.find((c) => c.candidate_id === deleteTarget);
    if (!target) return;
    const ok = window.confirm(`Delete candidate "${target.name}" permanently?`);
    if (!ok) return;
    setLoading(true);
    setError("");
    try {
      await deleteCandidate(deleteTarget);
      setError("Candidate deleted");
      setDeleteTarget("");
      setDeleteList((prev) => prev.filter((c) => c.candidate_id !== deleteTarget));
      if (tab === "name") setSearchResults((prev) => prev.filter((c) => c.candidate_id !== deleteTarget));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getCountriesOptions().then(setCountries).catch(() => { });
  }, []);

  useEffect(() => {
    loadDeleteList();
  }, []);

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-semibold rounded-lg transition ${tab === t ? "bg-[#C1121F] text-white" : "text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <section className="panel p-6">
      <p className="label">Step 2 — Mission Matching & Selection</p>
      <h2 className="mt-2 text-lg font-bold">Find Candidates for This Mission</h2>
      <p className="mt-1 text-sm text-slate-500">
        Run semantic matching, or search by name / country / skill to add candidates.
      </p>



      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => setTab("matching")} className={tabClass("matching")}>
          Semantic Match
        </button>
        <button onClick={() => setTab("name")} className={tabClass("name")}>
          By Name
        </button>
        <button onClick={() => setTab("country")} className={tabClass("country")}>
          By Country
        </button>
        <button onClick={() => setTab("skill")} className={tabClass("skill")}>
          By Skill
        </button>
        <button onClick={() => setTab("certification")} className={tabClass("certification")}>
          By Certification
        </button>
      </div>

      <div className="mt-4">
        {tab === "matching" && (
          <div>
            <div className="flex items-center gap-2">
              <button
                onClick={runMatch}
                disabled={loading || !missionText.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#C1121F] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-70"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                <Sparkles className="h-4 w-4" />
                Run Matching
              </button>
              <span className="text-xs text-slate-500">Re-indexes candidates — may take a moment</span>
            </div>
            {!missionText.trim() && (
              <p className="mt-3 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                Enter a mission description above to run semantic matching.
              </p>
            )}
            <AnimatePresence>
              {error && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 text-sm text-red-600">
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
            {matched.length === 0 && !loading && (
              <p className="mt-4 text-sm text-slate-500">No candidates matched yet. Run semantic matching to see results.</p>
            )}
            <div className="mt-4 grid gap-3">
              {matched.length > 0 && (
                <div className="mb-3 flex items-center justify-between">
                  <button
                    onClick={() => {
                      const allSelected = matched.every((c) => selected.has(c.candidate_id));
                      const next = new Map(selected);
                      if (allSelected) {
                        matched.forEach((c) => next.delete(c.candidate_id));
                      } else {
                        matched.forEach((c) => {
                          if (!next.has(c.candidate_id)) {
                            next.set(c.candidate_id, {
                              candidate_id: c.candidate_id,
                              name: c.name,
                              email: c.email,
                              source: "matching",
                            });
                          }
                        });
                      }
                      emit(next);
                    }}
                    className="text-xs font-semibold text-[#C1121F] hover:underline"
                  >
                    {matched.every((c) => selected.has(c.candidate_id)) ? "Deselect All" : "Select All"}
                  </button>
                  <span className="text-xs text-slate-400">{matched.length} result(s)</span>
                </div>
              )}
              {matched.map((c) => {
                const isSelected = selected.has(c.candidate_id);
                return (
                  <motion.div
                    key={c.candidate_id}
                    layout
                    className={`flex items-center gap-4 rounded-xl border p-4 ${isSelected ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"
                      }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleMatched(c)}
                      className="h-4 w-4 rounded border-slate-300 text-[#C1121F] focus:ring-[#C1121F]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{c.name}</p>
                      <p className="truncate text-xs text-slate-500">{c.email}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                      {(c.global_score * 100).toFixed(1)}
                    </span>
                    <button
                      onClick={() => onViewCandidate(c.candidate_id, c.name)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "name" && (
          <div>
            <div className="flex gap-2">
              <input
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runNameSearch()}
                placeholder="Search by name..."
                className="field flex-1"
              />
              <button onClick={runNameSearch} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-[#C1121F] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-70">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                <Search className="h-4 w-4" />
                Search
              </button>
            </div>
            <ResultList results={searchResults} selectedIds={new Set(selected.keys())} onAdd={addSearchResult} onAddMany={addSearchResultsMany} onRemoveMany={removeMany} hasSearched={nameSearched} missionText={missionText} onView={onViewCandidate} />          </div>
        )}

        {tab === "country" && (
          <div>
            <select
              value={countryQuery}
              onChange={(e) => setCountryQuery(e.target.value)}
              className="field w-full max-w-sm"
            >
              <option value="">Select a country</option>
              {countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button
              onClick={runCountrySearch}
              disabled={loading || !countryQuery}
              className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#C1121F] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-70"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Search by Country
            </button>
            <ResultList results={searchResults} selectedIds={new Set(selected.keys())} onAdd={addSearchResult} onAddMany={addSearchResultsMany} onRemoveMany={removeMany} hasSearched={nameSearched} missionText={missionText} onView={onViewCandidate} />          </div>
        )}

        {tab === "skill" && (
          <div>
            <div className="flex gap-2">
              <input
                value={skillQuery}
                onChange={(e) => {
                  setSkillQuery(e.target.value);
                  if (e.target.value.length >= 2) {
                    suggestSkills(e.target.value).then(setSuggestions).catch(() => { });
                  }
                }}
                onKeyDown={(e) => e.key === "Enter" && runSkillSearch()}
                placeholder="Type a skill..."
                className="field flex-1"
                list="skill-suggestions"
              />
              <datalist id="skill-suggestions">
                {suggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <button onClick={runSkillSearch} disabled={loading || !skillQuery.trim()} className="inline-flex items-center gap-2 rounded-xl bg-[#C1121F] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-70">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Search
              </button>
            </div>
            <ResultList results={searchResults} selectedIds={new Set(selected.keys())} onAdd={addSearchResult} onAddMany={addSearchResultsMany} onRemoveMany={removeMany} hasSearched={nameSearched} missionText={missionText} onView={onViewCandidate} />         </div>
        )}
        {tab === "certification" && (
          <div>
            <div className="flex gap-2">
              <input
                value={certQuery}
                onChange={(e) => {
                  setCertQuery(e.target.value);
                  if (e.target.value.length >= 1) {
                    suggestCertifications(e.target.value).then(setCertSuggestions).catch(() => { });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCertTag(certQuery);
                  }
                }}
                placeholder="Type a certification, press Enter to add..."
                className="field flex-1"
                list="certification-suggestions"
              />
              <datalist id="certification-suggestions">
                {certSuggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <button onClick={runCertSearch} disabled={loading || (certTags.length === 0 && !certQuery.trim())} className="inline-flex items-center gap-2 rounded-xl bg-[#C1121F] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-70">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Search
              </button>
            </div>

            {certTags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {certTags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium">
                    {tag}
                    <button onClick={() => removeCertTag(tag)} className="text-slate-400 hover:text-[#C1121F]">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <ResultList results={searchResults} selectedIds={new Set(selected.keys())} onAdd={addSearchResult} onAddMany={addSearchResultsMany} onRemoveMany={removeMany} hasSearched={nameSearched} missionText={missionText} onView={onViewCandidate} />
          </div>
        )}
      </div>

      {selectedList.length > 0 && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold">Selected candidates ({selectedList.length})</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {selectedList.map((s) => (
              <span key={s.candidate_id} className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium border border-slate-200">
                {s.name}
                <button onClick={() => remove(s.candidate_id)} className="text-slate-400 hover:text-[#C1121F]">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ResultList({
  results,
  selectedIds,
  onAdd,
  onAddMany,
  onRemoveMany,
  hasSearched,
  missionText,
  onView,
}: {
  results: CandidateSummary[];
  selectedIds: Set<string>;
  onAdd: (c: CandidateSummary) => void;
  onAddMany: (candidates: CandidateSummary[]) => void;
  onRemoveMany: (ids: string[]) => void;
  hasSearched?: boolean;
  missionText: string;
  onView: (candidateId: string, name: string) => void;
}) {
  const [scores, setScores] = useState<Record<string, { value: number; loading: boolean; error?: string }>>({});

  useEffect(() => {
    if (!missionText.trim()) return;

    results.forEach((c) => {
      // Skip candidates we've already scored or are currently scoring --
      // avoids re-firing on every unrelated re-render of the parent.
      setScores((prev) => {
        if (prev[c.candidate_id]) return prev;
        return { ...prev, [c.candidate_id]: { value: 0, loading: true } };
      });
    });

    results.forEach(async (c) => {
      // Re-check right before the call -- the setScores above is async,
      // so a second effect run could still race past the skip check.
      let alreadyHandled = false;
      setScores((prev) => {
        alreadyHandled = prev[c.candidate_id] !== undefined && !prev[c.candidate_id].loading;
        return prev;
      });
      if (alreadyHandled) return;

      try {
        const res = await scoreCandidateForMission(c.candidate_id, missionText);
        setScores((prev) => ({ ...prev, [c.candidate_id]: { value: res.avg_score, loading: false } }));
      } catch (e) {
        setScores((prev) => ({
          ...prev,
          [c.candidate_id]: { value: 0, loading: false, error: e instanceof Error ? e.message : "Failed" },
        }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, missionText]);

  if (results.length === 0 && hasSearched) {
    return (
      <p className="mt-4 text-sm text-slate-500">No results found. Try a different query.</p>
    );
  }

  const allSelected = results.length > 0 && results.every((c) => selectedIds.has(c.candidate_id));

  return (
    <div className="mt-4">
      {results.length > 0 && (
        <div className="mb-2 flex items-center justify-between">
          <button
            onClick={() => {
              if (allSelected) {
                onRemoveMany(results.map((c) => c.candidate_id));
              } else {
                onAddMany(results.filter((c) => !selectedIds.has(c.candidate_id)));
              }
            }}
            className="text-xs font-semibold text-[#C1121F] hover:underline"
          >
            {allSelected ? "Deselect All" : "Select All"}
          </button>
          <span className="text-xs text-slate-400">{results.length} result(s)</span>
        </div>
      )}
      <div className="grid gap-2">
        {results.map((c) => {
          const scoreState = scores[c.candidate_id];
          return (
            <div key={c.candidate_id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{c.name}</p>
                <p className="truncate text-xs text-slate-500">{c.email}</p>
              </div>

              {!missionText.trim() ? (
                <span className="text-xs text-slate-400">No mission set</span>
              ) : scoreState?.loading || !scoreState ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : scoreState.error ? (
                <span className="text-xs text-red-500">{scoreState.error}</span>
              ) : (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                  {scoreState.value.toFixed(1)}
                </span>
              )}
              <button
                onClick={() => onView(c.candidate_id, c.name)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <Eye className="h-3.5 w-3.5" />
                View
              </button>
              <button
                onClick={() => onAdd(c)}
                disabled={selectedIds.has(c.candidate_id)}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
