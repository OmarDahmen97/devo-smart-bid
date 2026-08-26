// file: src/components/GenerationStep.tsx
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Download, AlertTriangle, CheckCircle2 } from "lucide-react";
import { generateAdaptedCV } from "../api";
import type { GenerationResponse, SelectionEntry } from "../types";

export function GenerationStep({
  missionText,
  reviewSelections,
  selection,
  onBack,
}: {
  missionText: string;
  reviewSelections: Record<string, { selected_experience_indices: number[]; selected_project_indices: number[] }>;
  selection: SelectionEntry[];
  onBack: () => void;
}) {
  const [targetLanguage, setTargetLanguage] = useState("English");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerationResponse | null>(null);
  const [error, setError] = useState("");
  const [mergeIntoOne, setMergeIntoOne] = useState(false);
  const [outputFormat, setOutputFormat] = useState<"pptx" | "docx">("pptx");

  const nameFor = (candidateId: string) =>
    selection.find((s) => s.candidate_id === candidateId)?.name || candidateId;

  const generate = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const candidates = selection
        .filter((s) => reviewSelections[s.candidate_id])
        .map((s) => ({
          candidate_id: s.candidate_id,
          selected_experience_indices: reviewSelections[s.candidate_id].selected_experience_indices,
          selected_project_indices: reviewSelections[s.candidate_id].selected_project_indices,
        }));
      const data = await generateAdaptedCV(missionText, targetLanguage, candidates, mergeIntoOne, outputFormat);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel p-6">
      <p className="label">Step 4 — Generate CV</p>
      <h2 className="mt-2 text-lg font-bold">Generate Mission-Tailored CV</h2>
      <p className="mt-1 text-sm text-slate-500">
        Generates a filled {outputFormat.toUpperCase()} for each selected candidate, using the DVT template.
      </p>

      {!result && (
        <div className="mt-4">
          <label className="block text-sm font-semibold">Target Language</label>
          <select
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            className="field mt-1 w-full max-w-sm"
          >
            <option>English</option>
            <option>French</option>
            <option>Spanish</option>
            <option>German</option>
          </select>
          <label className="mt-4 block text-sm font-semibold">Output Format</label>
          <select
            value={outputFormat}
            onChange={(e) => {
              const fmt = e.target.value as "pptx" | "docx";
              setOutputFormat(fmt);
              if (fmt === "docx") setMergeIntoOne(false); // merge not supported for docx yet
            }}
            className="field mt-1 w-full max-w-sm"
          >
            <option value="pptx">PowerPoint (.pptx)</option>
            <option value="docx">Word (.docx)</option>
          </select>

          {selection.length > 1 && outputFormat === "pptx" && (
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={mergeIntoOne}
                onChange={(e) => setMergeIntoOne(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#C1121F] focus:ring-[#C1121F]"
              />
              Merge all candidates into one document
            </label>
          )}

          <button
            onClick={generate}
            disabled={loading}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#C1121F] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-70"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Generating…" : "Generate"}
          </button>
        </div>
      )}

      <AnimatePresence>
        {error && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 text-sm text-red-600">
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-3">
          {(result.zip_download_url || result.merged_download_url) && (
            <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-4">
              {result.merged_download_url && (
                <a
                  href={result.merged_download_url}
                  download
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
                >
                  <Download className="h-4 w-4" />
                  Download Merged Document
                </a>
              )}
              {result.zip_download_url && (
                <a
                  href={result.zip_download_url}
                  download
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" />
                  Download All (.zip)
                </a>
              )}
            </div>
          )}

          {result.merge_error && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Merge failed: {result.merge_error} — individual files are still available below.
            </p>
          )}

          {result.results.map((r) => (
            <div
              key={r.candidate_id}
              className={`flex items-center justify-between rounded-xl border p-4 ${r.status === "ok" ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
                }`}
            >
              <div className="flex items-center gap-3">
                {r.status === "ok" ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
                )}
                <div>
                  <p className="text-sm font-semibold">{nameFor(r.candidate_id)}</p>
                  {r.status === "error" && <p className="mt-0.5 text-xs text-red-700">{r.message}</p>}
                </div>
              </div>

              {r.status === "ok" && (
                <a
                  href={r.download_url}
                  download
                  className="inline-flex items-center gap-2 rounded-xl bg-[#C1121F] px-3 py-2 text-xs font-bold text-white hover:bg-[#A30F1A]"
                >
                  <Download className="h-4 w-4" />
                  Download {outputFormat.toUpperCase()}
                </a>
              )}

            </div>
          ))}
        </motion.div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <button onClick={onBack} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50">
          Back
        </button>
        {result && (
          <button
            onClick={() => setResult(null)}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"
          >
            Generate Again
          </button>
        )}
      </div>
    </section>
  );
}