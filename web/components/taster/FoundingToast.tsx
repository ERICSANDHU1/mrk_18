"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FOUNDING_500, fetchSpotsLeft } from "@/lib/founding500";

/** Ask 1 — the post-analysis toast on the free taster (signed-out visitors).
 *  Fires ~2.5s after the verdict renders, slides in bottom-right. Its job is the
 *  signup CLICK, not the sale — so the Founding 500 hook is present but the
 *  spots-left number stays small and secondary (the modal does the selling).
 *  Dismiss collapses it to a persistent pill (not gone) so the offer stays one
 *  tap away. Render this only for signed-out visitors (see TasterExplore). */
export default function FoundingToast() {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<"hidden" | "open" | "pill">("hidden");
  const [spots, setSpots] = useState<number>(FOUNDING_500.spotsLeft);

  useEffect(() => {
    const t = setTimeout(() => setPhase("open"), 2500);
    let alive = true;
    fetchSpotsLeft().then((n) => alive && setSpots(n)); // live count — ticks down per real signup
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-[calc(100vw-2.5rem)]">
      <AnimatePresence mode="wait">
        {phase === "open" && (
          <motion.div
            key="card"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, x: 24 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="glass w-[22rem] rounded-2xl p-5 shadow-[0_18px_50px_rgba(180,83,42,0.18)]"
          >
            <button
              onClick={() => setPhase("pill")}
              aria-label="Dismiss"
              className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-lg text-muted transition-colors hover:bg-[#1b1815]/[0.06] hover:text-ink"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>

            <p
              className="pr-6 text-[15px] font-bold leading-snug text-ink"
              style={{ fontFamily: "var(--font-claude-serif), Georgia, serif" }}
            >
              You just met your CMO&apos;s intern.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Sign up free — and lock <span className="font-semibold text-ink">Founding 500</span>{" "}
              pricing before the first {FOUNDING_500.total} spots go.
            </p>

            <div className="mt-4 flex items-center gap-3">
              <Link
                href="/sign-up"
                className="rounded-xl px-4 py-2.5 text-[13.5px] font-semibold text-[color:var(--cta-ink,#0a0a0b)] shadow-[0_10px_32px_var(--cta-glow,rgba(255,106,0,0.3))] transition-shadow duration-300 hover:shadow-[0_14px_44px_var(--cta-glow-strong,rgba(255,106,0,0.45))]"
                style={{ background: "var(--gradient-brand)" }}
              >
                Sign up free →
              </Link>
              <span className="font-data text-[11.5px] font-medium text-muted">
                {spots} left
              </span>
            </div>
          </motion.div>
        )}

        {phase === "pill" && (
          <motion.button
            key="pill"
            onClick={() => setPhase("open")}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="glass flex items-center gap-2 rounded-full py-2 pl-4 pr-3 text-[13px] font-semibold text-ink shadow-[0_12px_36px_rgba(180,83,42,0.16)] transition-colors hover:border-amber/40"
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--gradient-brand)" }} />
            Lock Founding 500 pricing
            <span className="font-data text-[11px] text-muted">{spots} left</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
