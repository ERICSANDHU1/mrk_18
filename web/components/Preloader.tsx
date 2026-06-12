"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Phase = "count" | "split" | "done";

export default function Preloader() {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<Phase>("count");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setProgress(100);
      setPhase("done");
      return;
    }

    document.documentElement.style.overflow = "hidden";
    const start = performance.now();
    const duration = 1300;
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setProgress(Math.round(eased * 100));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setPhase("split");
        setTimeout(() => {
          setPhase("done");
          document.documentElement.style.overflow = "";
        }, 850);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      document.documentElement.style.overflow = "";
    };
  }, []);

  return (
    <AnimatePresence>
      {phase !== "done" && (
        <motion.div
          className="fixed inset-0 z-[100]"
          exit={{ opacity: 0 }}
          aria-hidden
        >
          {/* theatre curtains */}
          <motion.div
            className="absolute inset-x-0 top-0 h-1/2 bg-bg"
            animate={phase === "split" ? { y: "-100%" } : { y: 0 }}
            transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 h-1/2 bg-bg"
            animate={phase === "split" ? { y: "100%" } : { y: 0 }}
            transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
          />

          {/* counter */}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center gap-4"
            animate={phase === "split" ? { opacity: 0, scale: 0.96 } : { opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <span className="text-[11px] uppercase tracking-[0.3em] text-muted">
              mrk18 · your AI CMO
            </span>
            <span className="text-gradient text-7xl font-extrabold tabular-nums tracking-tight md:text-8xl">
              {progress}
            </span>
            <div className="h-px w-48 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full"
                style={{
                  width: `${progress}%`,
                  background: "var(--gradient-brand)",
                  transition: "width 80ms linear",
                }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
