// Single source of truth for the Founding 500 conversion funnel — the pricing
// (Option C: a discount AND frozen for life) and the manually-updated
// spots-left counter. The post-analysis toast, the upgrade modal, and any
// pricing surface all read from HERE, so the number and the prices can never
// contradict each other across surfaces.
//
// SPOTS_LEFT is deliberately STATIC config, not a live count or a fake
// countdown: update it by hand as real signups land. Never decrement it
// client-side. Change this one number and every surface reflects it.

export const FOUNDING_500_SPOTS_LEFT = 342; // ← update by hand as signups land
export const FOUNDING_500_TOTAL = 500;

export const FOUNDING_500 = {
  spotsLeft: FOUNDING_500_SPOTS_LEFT,
  total: FOUNDING_500_TOTAL,
  // Option C — discount off the regular price AND locked for life for the
  // first 500. "For life" is the real differentiator over a plain discount.
  pro: { founding: "₹2,799", regular: "₹3,499" },
  max: { founding: "₹9,499", regular: "₹11,999" },
} as const;
