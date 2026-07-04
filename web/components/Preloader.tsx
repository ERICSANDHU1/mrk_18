"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Logo from "@/components/app/Logo";
import Wordmark from "@/components/app/Wordmark";

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
            className="absolute inset-0 flex flex-col items-center justify-center"
            animate={phase === "split" ? { opacity: 0, scale: 0.96 } : { opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {/* brand lockup — the prism mark + wordmark (oxblood 18) */}
            <div className="flex items-center gap-2.5">
              <Logo size={26} />
              <Wordmark className="text-[22px] font-extrabold tracking-tight text-ink" />
            </div>

            {/* count-up to 100 */}
            <span className="mt-9 text-gradient text-7xl font-extrabold leading-none tracking-tight tabular-nums md:text-8xl">
              {progress}
            </span>

            {/* progress bar */}
            <div className="mt-8 h-px w-56 overflow-hidden rounded-full bg-surface-2">
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
