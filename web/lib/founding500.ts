// Single source of truth for the Founding 500 conversion funnel — the pricing
// (Option C: a discount AND frozen for life) and the spots-left counter. The
// post-analysis toast, the upgrade modal, and any pricing surface all read
// from HERE, so the number and the prices can never contradict each other.
//
// SPOTS_LEFT below is the CALIBRATION POINT (and the offline fallback):
// fetchSpotsLeft() starts from it and decreases 1:1 as real application rows
// land in Supabase — a live count, never a fake client-side countdown.

import { WAITLIST_FALLBACK } from "@/lib/waitlist";

export const FOUNDING_500_SPOTS_LEFT = 342; // spots when in_line sits at its seed
export const FOUNDING_500_TOTAL = 500;

/** Live spots-left. Both funnel forms (landing waitlist + upgrade modal) write
 *  to the same applications table, and the public GET /api/apply reports
 *  `in_line` = seed + new rows. So: spots = SPOTS_LEFT - (in_line - seed),
 *  clamped at 0 — it automatically ticks down by one for every submitted form,
 *  on every surface at once. Falls back to the static number if the fetch
 *  fails. To re-calibrate later, change FOUNDING_500_SPOTS_LEFT. */
export async function fetchSpotsLeft(): Promise<number> {
  try {
    const r = await fetch("/api/apply", { cache: "no-store" });
    const d = await r.json();
    if (typeof d?.in_line === "number") {
      return Math.max(0, FOUNDING_500_SPOTS_LEFT - (d.in_line - WAITLIST_FALLBACK));
    }
  } catch {}
  return FOUNDING_500_SPOTS_LEFT;
}

export const FOUNDING_500 = {
  spotsLeft: FOUNDING_500_SPOTS_LEFT,
  total: FOUNDING_500_TOTAL,
  // Option C — discount off the regular price AND locked for life for the
  // first 500. "For life" is the real differentiator over a plain discount.
  pro: { founding: "₹2,799", regular: "₹3,499" },
  max: { founding: "₹9,499", regular: "₹11,999" },
} as const;
