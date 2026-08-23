// file: src/components/DeleteCandidateModal.tsx
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2, Loader2 } from "lucide-react";
import { searchCandidatesByName, deleteCandidate } from "../api";
import type { CandidateSummary } from "../types";

export function DeleteCandidateModal({ onClose }: { onClose: () => void }) {
  const [deleteList, setDeleteList] = useState<CandidateSummary[]>([]);
  const [deleteTarget, setDeleteTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const loadDeleteList = async () => {
    try {
      const data = await searchCandidatesByName("");
      setDeleteList(data);
    } catch {
      setDeleteList([]);
    }
  };

  useEffect(() => {
    loadDeleteList();
  }, []);

  const handleDeleteSelected = async () => {
    if (!deleteTarget) return;
    const target = deleteList.find((c) => c.candidate_id === deleteTarget);
    if (!target) return;
    const ok = window.confirm(`Delete candidate "${target.name}" permanently?`);
    if (!ok) return;
    setLoading(true);
    setMessage("");
    try {
      await deleteCandidate(deleteTarget);
      setMessage("Candidate deleted");
      setDeleteTarget("");
      setDeleteList((prev) => prev.filter((c) => c.candidate_id !== deleteTarget));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/40 p-4 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onMouseDown={onClose}
      >
        <motion.div
          initial={{ scale: 0.96, y: 10 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.96, y: 10 }}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="label">Danger zone</p>
              <h2 className="mt-1 text-xl font-bold">Delete Candidate</h2>
              <p className="mt-1 text-sm text-slate-500">Permanently removes a candidate from the database.</p>
            </div>
            <button onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-5 flex gap-2">
            <select
              value={deleteTarget}
              onChange={(e) => setDeleteTarget(e.target.value)}
              className="field flex-1"
            >
              <option value="">Select a candidate...</option>
              {deleteList.map((c) => (
                <option key={c.candidate_id} value={c.candidate_id}>{c.name}</option>
              ))}
            </select>
            <button onClick={loadDeleteList} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
              Refresh
            </button>
          </div>

          <button
            onClick={handleDeleteSelected}
            disabled={loading || !deleteTarget}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-70"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            <Trash2 className="h-4 w-4" />
            Delete
          </button>

          {message && (
            <p className="mt-3 text-sm text-slate-600">{message}</p>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}