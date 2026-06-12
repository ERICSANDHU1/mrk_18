"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";

const KEY = "mrk18.onboarded";
const EVENT = "mrk18:onboarded";

const STEPS = [
  "Reading 47 campaigns across 5 channels…",
  "Tracing ₹1,86,000 of monthly spend to real customers…",
  "Separating activity from results…",
];

// session fallback when localStorage is unavailable (private mode)
let memDismissed = false;

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

function getOnboarded() {
  if (memDismissed) return true;
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return true; // private mode — skip the overlay
  }
}

/** First-run overlay: "we're analyzing your marketing… your CMO will call shortly." */
export default function OnboardingOverlay() {
  // SSR assumes onboarded (no overlay flash); client snapshot decides after hydration
  const onboarded = useSyncExternalStore(subscribe, getOnboarded, () => true);
  const open = !onboarded;
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!open || step >= STEPS.length) return;
    const t = setTimeout(() => setStep((s) => s + 1), 1100);
    return () => clearTimeout(t);
  }, [open, step]);

  const dismiss = () => {
    memDismissed = true;
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* session fallback already set */
    }
    window.dispatchEvent(new Event(EVENT));
  };

  const ready = step >= STEPS.length;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Setting up your AI CMO"
          className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md rounded-2xl border border-stroke-2 bg-surface p-7"
          >
            <span aria-hidden className="mb-5 grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-molten via-amber to-ember text-base font-extrabold text-black">
              m
            </span>
            <h2 className="text-xl font-extrabold tracking-tight">
              We&apos;re analyzing your marketing.
            </h2>
            <p className="mt-1 text-[13px] text-muted">Your CMO will call shortly.</p>

            <ul className="mt-6 space-y-3" aria-live="polite">
              {STEPS.map((s, i) => {
                const done = step > i;
                const current = step === i;
                return (
                  <li key={s} className="flex items-center gap-3 text-[13px]">
                    <span
                      aria-hidden
                      className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[9px] font-bold transition-colors duration-300 ${
                        done
                          ? "border-good/40 bg-good/15 text-good"
                          : current
                            ? "border-amber/50 text-amber"
                            : "border-stroke-2 text-muted/40"
                      }`}
                    >
                      {done ? "✓" : ""}
                      {current && (
                        <motion.span
                          className="h-1.5 w-1.5 rounded-full bg-amber"
                          animate={{ opacity: [1, 0.2, 1] }}
                          transition={{ repeat: Infinity, duration: 1 }}
                        />
                      )}
                    </span>
                    <span className={done || current ? "text-ink" : "text-muted/50"}>{s}</span>
                  </li>
                );
              })}
            </ul>

            <button
              onClick={dismiss}
              disabled={!ready}
              className={`mt-7 w-full rounded-lg px-4 py-2.5 text-[13px] font-bold transition-all duration-300 ${
                ready
                  ? "bg-gradient-to-r from-molten via-amber to-ember text-black hover:opacity-90"
                  : "cursor-not-allowed border border-stroke-2 bg-surface-2 text-muted"
              }`}
            >
              {ready ? "See this week's verdict" : "Analyzing…"}
            </button>
            <button
              onClick={dismiss}
              className="mt-2.5 w-full rounded-lg px-4 py-1.5 text-[12px] text-muted transition-colors duration-200 hover:text-ink"
            >
              Skip
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
