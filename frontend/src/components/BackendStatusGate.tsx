// file: src/components/BackendStatusGate.tsx
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ServerCrash } from "lucide-react";

const POLL_INTERVAL_MS = 1500;
const BASE = "/";

export function BackendStatusGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      try {
        const res = await fetch(`${BASE}health`);
        const data = await res.json();
        if (cancelled) return;
        if (data.ready) {
          setReady(true);
          return;
        }
      } catch {
        attempts += 1;
        if (attempts > 20 && !cancelled) setUnreachable(true);
      }
      if (!cancelled) setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AnimatePresence mode="wait">
      {!ready ? (
        <motion.div
          key="loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] grid place-items-center bg-white"
        >
          <div className="flex flex-col items-center gap-4">
            {unreachable ? (
              <>
                <ServerCrash className="h-10 w-10 text-red-500" />
                <p className="text-sm font-semibold text-slate-700">Backend unreachable</p>
                <p className="text-xs text-slate-500">Check that the API server is running.</p>
              </>
            ) : (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                >
                  <Loader2 className="h-10 w-10 text-[#C1121F]" />
                </motion.div>
                <p className="text-sm font-semibold text-slate-700">Starting up…</p>
                <p className="text-xs text-slate-500">Loading embedding model and vector store</p>
              </>
            )}
          </div>
        </motion.div>
      ) : (
        <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}