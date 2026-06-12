import type {
  ActivityResultPoint,
  HeroNumber,
  Kpi,
  LeakAlert,
  NextMove,
  WeekVerdict,
} from "./types";

export const weekVerdict: WeekVerdict = {
  headline: "Your marketing is busy but leaking — fix Google Ads first.",
  sub: "₹68,000 went into Google Ads this month and brought 3 customers. Content and email brought 22 at a tenth of the cost.",
  confidence: "high",
  dateRange: "13 May – 12 Jun 2026",
};

export const heroNumber: HeroNumber = {
  label: "Customers from marketing this month",
  value: 41,
  target: 60,
  unit: "customers",
  trendPct: 5,
  status: "watch",
  takeaway: "Growth is coming from content and email. Paid is adding spend, not customers.",
};

export const nextMoves: NextMove[] = [
  {
    id: "nm-1",
    title: "Pause 14 broad-match keywords in Google Ads",
    why: "They ate ₹42,000 last month and produced zero tracked customers.",
    metricLabel: "Google Ads CAC",
    metricValue: "₹22,667 vs ₹4,537 blended",
    impact: "Stops ~₹42k/mo of waste without touching the terms that convert.",
  },
  {
    id: "nm-2",
    title: "Shift ₹30k from LinkedIn Ads into SEO comparison pages",
    why: "LinkedIn delivered 2 customers at ₹12,000 each. Content delivers them at ₹2,000.",
    metricLabel: "Cost per customer",
    metricValue: "₹12,000 → ₹2,000",
    impact: "Worth ~12–15 extra customers a quarter at current content CAC.",
  },
  {
    id: "nm-3",
    title: "Fix the drop at onboarding step 2",
    why: "828 of 1,240 signups never reach the first invoice — your biggest non-spend lever.",
    metricLabel: "Activation",
    metricValue: "33% vs 45% target",
    impact: "Every 5 pts of activation ≈ 62 more active accounts a month.",
  },
];

export const leakAlerts: LeakAlert[] = [
  {
    id: "leak-google",
    channel: "Google Ads",
    monthlyWaste: 42000,
    conversions: 0,
    severity: "leaking",
    summary: "₹42,000/mo draining in Google Ads, 0 conversions from broad-match terms.",
    evidence: [
      "Search-term report: 61% of spend went to queries with zero signups in 90 days.",
      "Broad-match keywords pulled in \"free invoice template\" traffic — bounces in under 20 seconds.",
      "Display network spillover: ₹6,800 on placements you never chose.",
    ],
    fix: "Pause the 14 broad-match keywords and cap display. Keep exact-match brand + competitor terms.",
  },
  {
    id: "leak-linkedin",
    channel: "LinkedIn Ads",
    monthlyWaste: 9500,
    conversions: 2,
    severity: "watch",
    summary: "LinkedIn CAC is ₹12,000 — 6× your content channel. Watch, don't panic.",
    evidence: [
      "2 customers in 30 days on ₹24,000 spend.",
      "Clicks are senior-title but trial starts are not converting to paid.",
    ],
    fix: "Hold spend flat, swap the offer to the ROI calculator, re-check in 2 weeks.",
  },
];

export const kpis: Kpi[] = [
  {
    id: "kpi-spend",
    label: "Spend",
    value: 186000,
    kind: "inr",
    target: 175000,
    trendPct: 6,
    lowerIsBetter: true,
    status: "watch",
  },
  {
    id: "kpi-cac",
    label: "CAC (blended)",
    value: 4537,
    kind: "inr",
    target: 3500,
    trendPct: 18,
    lowerIsBetter: true,
    status: "leaking",
  },
  {
    id: "kpi-activation",
    label: "Activation",
    value: 33,
    kind: "pct",
    target: 45,
    trendPct: -2,
    lowerIsBetter: false,
    status: "watch",
  },
  {
    id: "kpi-retention",
    label: "Retention (30d)",
    value: 65,
    kind: "pct",
    target: 60,
    trendPct: 4,
    lowerIsBetter: false,
    status: "healthy",
  },
];

/** Last 8 weeks: shipped marketing activity vs new paying customers. */
export const activityVsResults: ActivityResultPoint[] = [
  { week: "20 Apr", activity: 14, results: 5 },
  { week: "27 Apr", activity: 18, results: 6 },
  { week: "4 May", activity: 16, results: 5 },
  { week: "11 May", activity: 21, results: 6 },
  { week: "18 May", activity: 19, results: 5 },
  { week: "25 May", activity: 23, results: 6 },
  { week: "1 Jun", activity: 22, results: 6 },
  { week: "8 Jun", activity: 25, results: 5 },
];

export const activityTakeaway =
  "Output is up 79% in 8 weeks. Customers are flat — more activity isn't the answer.";
