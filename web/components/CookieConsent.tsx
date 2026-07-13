"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/** Cookie consent banner.
 *
 *  What cookies mrk18 actually sets:
 *   - ESSENTIAL (always on, no consent needed): Clerk's session cookies keep you
 *     signed in across refreshes and tabs. These are strictly necessary — the
 *     app can't authenticate you without them — so they're exempt from consent
 *     under GDPR/DPDP and are never gated here.
 *   - ANALYTICS/OPTIONAL: none today. When we add product analytics later, this
 *     is the gate: read hasConsent("analytics") before loading any such script.
 *
 *  The choice is stored in localStorage (not a cookie) so the banner itself
 *  needs no consent, and it only appears until the visitor decides. Decline is a
 *  first-class button, equal weight to Accept (dark-pattern-free).
 */
const STORAGE_KEY = "mrk18-cookie-consent"; // "accepted" | "declined"

/** Read the saved choice — use before loading any non-essential script. */
export function hasConsent(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "accepted";
}

export default function CookieConsent() {
  const reduceMotion = useReducedMotion();
  const [show, setShow] = useState(false);

  useEffect(() => {
    // show only if they haven't chosen yet; defer a beat so it doesn't fight the
    // page's entrance animations
    if (!localStorage.getItem(STORAGE_KEY)) {
      const t = setTimeout(() => setShow(true), 1200);
      return () => clearTimeout(t);
    }
  }, []);

  const decide = (choice: "accepted" | "declined") => {
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {}
    setShow(false); // AnimatePresence plays the exit as show goes true → false
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="dialog"
          aria-label="Cookie choices"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-0 bottom-0 z-[130] flex justify-center p-4"
        >
          <div className="glass flex w-full max-w-3xl flex-col items-start gap-4 rounded-2xl p-5 shadow-[0_18px_50px_rgba(27,24,21,0.18)] sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13.5px] leading-relaxed text-ink">
              We use essential cookies to keep you signed in. That&apos;s it — no
              tracking, no ads.{" "}
              <Link href="/privacy" className="font-semibold text-molten underline-offset-2 hover:underline">
                Privacy
              </Link>
            </p>
            <div className="flex shrink-0 items-center gap-2.5">
              <button
                onClick={() => decide("declined")}
                className="rounded-xl border border-stroke px-4 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-[#1b1815]/[0.05]"
              >
                Decline
              </button>
              <button
                onClick={() => decide("accepted")}
                className="rounded-xl px-5 py-2 text-[13px] font-semibold text-[color:var(--cta-ink,#0a0a0b)] shadow-[0_10px_28px_var(--cta-glow,rgba(255,106,0,0.3))] transition-shadow hover:shadow-[0_12px_36px_var(--cta-glow-strong,rgba(255,106,0,0.45))]"
                style={{ background: "var(--gradient-brand)" }}
              >
                Accept
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
