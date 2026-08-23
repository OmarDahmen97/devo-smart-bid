import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ChevronLeft, ChevronRight, Check, X } from "lucide-react";
import { UploadStep } from "./components/UploadStep";
import { MatchingStep } from "./components/MatchingStep";
import { ReviewStep } from "./components/ReviewStep";
import { GenerationStep } from "./components/GenerationStep";
import { CandidateDetailModal } from "./components/CandidateDetailModal";
import type { SelectionEntry, CandidateSelection, Step } from "./types";
import { Trash2 } from "lucide-react";
import { DeleteCandidateModal } from "./components/DeleteCandidateModal";

const steps: { key: Step; label: string }[] = [
  { key: "upload", label: "Upload CVs" },
  { key: "matching", label: "Match & Select" },
  { key: "review", label: "Review" },
  { key: "generation", label: "Generate" },
];

export default function App() {
  const [step, setStep] = useState<Step>("upload");
  const [missionText, setMissionText] = useState("");
  const [selection, setSelection] = useState<SelectionEntry[]>([]);
  const [reviewSelections, setReviewSelections] = useState<Record<string, { selected_experience_indices: number[]; selected_project_indices: number[] }>>({});
  const [detailCandidate, setDetailCandidate] = useState<{ candidateId: string; name: string } | null>(null);
  const [toast, setToast] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  const canAdvance = () => {
    if (step === "upload") return true;
    if (step === "matching") return selection.length > 0;
    if (step === "review") return Object.keys(reviewSelections).length > 0;
    return true;
  };

  const next = () => {
    if (!canAdvance()) return;
    const idx = steps.findIndex((s) => s.key === step);
    if (idx < steps.length - 1) setStep(steps[idx + 1].key);
  };

  const goToGeneration = useCallback(
    (selections: Record<string, { selected_experience_indices: number[]; selected_project_indices: number[] }>) => {
      setReviewSelections(selections);
      const idx = steps.findIndex((s) => s.key === "review");
      if (idx < steps.length - 1) setStep(steps[idx + 1].key);
    },
    []
  );

  const prev = () => {
    const idx = steps.findIndex((s) => s.key === step);
    if (idx > 0) setStep(steps[idx - 1].key);
  };

  return (
    <main className="min-h-screen bg-slate-50 pb-16">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <img
              src="https://pbs.twimg.com/profile_images/1465734821402005512/drXcIBUn_400x400.jpg"
              alt="Devoteam"
              className="h-12 w-auto object-contain"
            />

            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                DevoSmartBid
              </h1>
              <p className="hidden text-sm text-slate-500 sm:block">
                AI-Powered CV Matching Platform
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-full bg-slate-100 px-4 py-2 sm:flex">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium text-slate-600">
              Smart CV Matching
            </span>
          </div>

          <button
            onClick={() => setShowDeleteModal(true)}
            className="ml-2 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-red-50 hover:text-[#C1121F]"
          >
            <Trash2 className="h-4 w-4" />
            <span className="hidden sm:inline">Manage Candidates</span>
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5">
        <section className="mx-auto max-w-3xl py-10 text-center">
          <p className="label text-[#C1121F]">Semantic candidate discovery</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl">AI CV Matching Platform</h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-500">
            Upload CVs, match against a mission, review experiences, and generate adapted content.
          </p>
        </section>

        <nav className="mb-8 flex items-center justify-center gap-2">
          {steps.map((s, i) => {
            const active = s.key === step;
            const done = steps.findIndex((x) => x.key === step) > i;
            return (
              <button
                key={s.key}
                onClick={() => {
                  if (done || active) setStep(s.key);
                }}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${active
                  ? "bg-[#C1121F] text-white"
                  : done
                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "bg-slate-100 text-slate-500"
                  }`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${active ? "bg-white/20" : done ? "bg-emerald-200 text-emerald-800" : "bg-slate-200 text-slate-500"
                  }`}>
                  {done ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                {s.label}
              </button>
            );
          })}
        </nav>

        {step !== "generation" && (
          <div className="mx-auto max-w-2xl">
            <label className="block text-sm font-semibold text-slate-700">
              Mission Description <span className="text-xs font-normal text-slate-500">(shared across steps)</span>
            </label>
            <textarea
              value={missionText}
              onChange={(e) => setMissionText(e.target.value)}
              placeholder="Paste or write the mission description..."
              rows={4}
              className="mt-1 field w-full min-h-[240px] resize-y"
            />
          </div>
        )}

        <div className="mx-auto mt-6 max-w-5xl">
          <AnimatePresence mode="wait">
            {step === "upload" && (
              <motion.div key="upload" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <UploadStep onUploaded={() => showToast("CVs uploaded")} />
              </motion.div>
            )}

            {step === "matching" && (
              <motion.div key="matching" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <MatchingStep
                  missionText={missionText}
                  onSelectionChange={(sel) => {
                    setSelection(sel);
                    showToast(`${sel.length} candidate(s) selected`);
                  }}
                />
                {selection.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selection.map((s) => (
                      <span
                        key={s.candidate_id}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm"
                      >
                        <span>{s.name}</span>
                        <button
                          onClick={() => {
                            setSelection((prev) => prev.filter((x) => x.candidate_id !== s.candidate_id));
                            showToast("Removed from selection");
                          }}
                          className="text-slate-400 hover:text-[#C1121F]"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDetailCandidate({ candidateId: s.candidate_id, name: s.name })}
                          className="text-xs text-[#C1121F] underline"
                        >
                          View CV
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {step === "review" && (
              <motion.div key="review" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <ReviewStep
                  selection={selection}
                  missionText={missionText}
                  onBack={prev}
                  onGenerate={goToGeneration}
                />
              </motion.div>
            )}

            {step === "generation" && (
              <motion.div key="generation" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <GenerationStep
                  missionText={missionText}
                  reviewSelections={reviewSelections}
                  selection={selection}
                  onBack={prev}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="mx-auto mt-8 flex max-w-5xl items-center justify-between">
          <button
            onClick={prev}
            disabled={step === "upload"}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold disabled:opacity-50 hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <button
            onClick={next}
            disabled={step === "generation" || !canAdvance()}
            className="inline-flex items-center gap-2 rounded-xl bg-[#C1121F] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50 hover:bg-[#A30F1A]"
          >
            {step === "review" ? "Generate" : "Continue"} <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {detailCandidate && (
          <CandidateDetailModal
            candidateId={detailCandidate.candidateId}
            name={detailCandidate.name}
            onClose={() => setDetailCandidate(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-xl"
          >
            <Check className="h-4 w-4 text-emerald-400" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showDeleteModal && (
          <DeleteCandidateModal onClose={() => setShowDeleteModal(false)} />
        )}
      </AnimatePresence>
    </main>
  );
}
