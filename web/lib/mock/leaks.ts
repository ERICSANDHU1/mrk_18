import type { LeakRow } from "./types";

/** Ranked by money wasted — the bitter-truth table. */
export const leakRows: LeakRow[] = [
  {
    id: "lr-google",
    channel: "Google Ads",
    spend: 68000,
    conversions: 3,
    cac: 22667,
    verdict: "leaking",
    wastedPerMonth: 42000,
    why: "61% of spend goes to broad-match queries that have never produced a signup. The 3 customers all came from exact-match brand and competitor terms.",
    fix: "Pause 14 broad-match keywords, cap display placements, keep exact-match. Expected: same conversions, ~₹42k/mo back.",
  },
  {
    id: "lr-linkedin",
    channel: "LinkedIn Ads",
    spend: 24000,
    conversions: 2,
    cac: 12000,
    verdict: "watch",
    wastedPerMonth: 9500,
    why: "Right audience, wrong offer — senior-title clicks that stall at the trial. CAC is 6× your content channel.",
    fix: "Hold budget flat, swap creative to the ROI calculator offer, re-verdict in 2 weeks.",
  },
  {
    id: "lr-meta",
    channel: "Meta Ads",
    spend: 52000,
    conversions: 14,
    cac: 3714,
    verdict: "healthy",
    wastedPerMonth: 0,
    why: "Retargeting set does the work: ₹3,714 CAC, stable for 6 weeks, frequency under 2.3.",
    fix: "Leave it alone. Refresh creative when frequency crosses 3.",
  },
  {
    id: "lr-content",
    channel: "Content / SEO",
    spend: 30000,
    conversions: 15,
    cac: 2000,
    verdict: "healthy",
    wastedPerMonth: 0,
    why: "Comparison pages convert at 4.1% — your cheapest customers and they retain best (78% at 30 days).",
    fix: "Double down: 2 more comparison pages this month (the next-move card has the brief).",
  },
  {
    id: "lr-email",
    channel: "Email",
    spend: 12000,
    conversions: 7,
    cac: 1714,
    verdict: "healthy",
    wastedPerMonth: 0,
    why: "Onboarding sequence converts trials that product alone doesn't. 41% open, 9% click — clean list.",
    fix: "Add the day-5 case-study email the CMO drafted; nothing else.",
  },
];

export const leaksTakeaway =
  "₹51,500 of your ₹1,86,000 month is doing nothing. Two fixes recover most of it.";
