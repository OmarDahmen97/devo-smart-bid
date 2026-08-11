import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloudUpload, FileText, Loader2, X } from "lucide-react";
import { updateCandidateName } from "../api";
import type { UploadResultItem, UploadErrorItem } from "../types";

const statusStyles: Record<string, string> = {
  new_candidate: "border-emerald-200 bg-emerald-50 text-emerald-700",
  new_version: "border-amber-200 bg-amber-50 text-amber-700",
  duplicate: "border-slate-200 bg-slate-50 text-slate-600",
};

export function UploadStep({ onUploaded }: { onUploaded: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<(UploadResultItem | UploadErrorItem)[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const [nameInputs, setNameInputs] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const add = useCallback((next: FileList | null) => {
    if (!next) return;
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      const incoming = Array.from(next).filter((f) => !names.has(f.name));
      return [...prev, ...incoming];
    });
  }, []);

  const upload = async () => {
    if (!files.length) return;
    setLoading(true);
    setResults([]);
    setNameInputs({});
    setSavedId(null);
    try {
      const res = await fetch("http://127.0.0.1:8000/cv/upload", {
        method: "POST",
        body: (() => {
          const form = new FormData();
          files.forEach((f) => form.append("files", f));
          return form;
        })(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { results: (UploadResultItem | UploadErrorItem)[] };
      setResults(data.results);
      onUploaded();
    } catch (e) {
      setResults([{ filename: "", error: e instanceof Error ? e.message : "Unknown error" }]);
    } finally {
      setLoading(false);
    }
  };

  const saveName = async (candidateId: string, name: string) => {
    if (!name.trim()) return;
    setSavingId(candidateId);
    try {
      await updateCandidateName(candidateId, name.trim());
      setSavedId(candidateId);
      setResults((prev) =>
        prev.map((r) => ("candidate_id" in r && r.candidate_id === candidateId ? { ...r, name: name.trim() } : r))
      );
    } catch {
      // handled by user seeing the failure
    } finally {
      setSavingId(null);
      setTimeout(() => setSavedId(null), 2000);
    }
  };

  return (
    <section className="panel p-6">
      <p className="label">Step 1 — Upload CVs</p>
      <h2 className="mt-2 text-lg font-bold">Upload Candidate CVs</h2>
      <p className="mt-1 text-sm text-slate-500">Import candidate profiles. Files are parsed, stored, and deduplicated automatically.</p>

      <button
        type="button"
        onClick={() => input.current?.click()}
        className="mt-5 flex min-h-28 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-4 transition hover:border-[#C1121F] hover:bg-red-50 focus:outline-none focus:ring-4 focus:ring-red-100"
      >
        <CloudUpload className="h-8 w-8 text-[#C1121F]" />
        <span className="mt-3 text-sm font-semibold">Drop CVs here</span>
        <span className="mt-1 text-xs text-slate-500">or click to browse · PDF, DOCX, PPTX</span>
      </button>
      <input ref={input} className="hidden" type="file" multiple accept=".pdf,.docx,.pptx" onChange={(e) => add(e.target.files)} />

      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{files.length} file(s) selected</p>
            <button onClick={() => setFiles([])} className="text-xs font-medium text-[#C1121F]">Clear all</button>
          </div>
          {files.map((file) => (
            <div key={file.name} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
              <button onClick={() => setFiles((prev) => prev.filter((f) => f.name !== file.name))} aria-label={`Remove ${file.name}`}>
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>
          ))}
          <button
            onClick={upload}
            disabled={loading}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#C1121F] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-70"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Extracting…" : "Upload & Extract"}
          </button>
        </div>
      )}

      <AnimatePresence>
        {results.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="mt-5 space-y-3">
            <p className="text-sm font-semibold">Results</p>
            {results.map((r, i) => (
              <div key={i} className={`rounded-xl border p-4 ${"error" in r ? "border-red-200 bg-red-50" : `border ${statusStyles[r.status] || "border-slate-200 bg-slate-50"}`}`}>
                {"error" in r ? (
                  <p className="text-sm text-red-700">{r.error || "Unknown error"}</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="flex items-center gap-2">
                      {!r.name ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const val = nameInputs[r.candidate_id] || "";
                            if (val.trim()) saveName(r.candidate_id, val);
                          }}
                          className="flex items-center gap-2"
                        >
                          <input
                            value={nameInputs[r.candidate_id] || ""}
                            onChange={(e) =>
                              setNameInputs((prev) => ({ ...prev, [r.candidate_id]: e.target.value }))
                            }
                            placeholder="Enter candidate name..."
                            className="field text-sm"
                          />
                          <button
                            type="submit"
                            disabled={savingId === r.candidate_id || !(nameInputs[r.candidate_id] || "").trim()}
                            className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {savingId === r.candidate_id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : savedId === r.candidate_id ? (
                              "Saved"
                            ) : (
                              "Save"
                            )}
                          </button>
                        </form>
                      ) : (
                        <span className="text-sm font-semibold">{r.name}</span>
                      )}
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${statusStyles[r.status]}`}>{r.status.replace("_", " ")}</span>
                    <span className="text-xs text-slate-500">v{r.version} · {r.experience_count_after_merge} experiences</span>
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
