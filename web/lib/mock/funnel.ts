import type { FunnelStage } from "./types";

export const funnelStages: FunnelStage[] = [
  {
    id: "fs-visitors",
    name: "Channel traffic",
    count: 48200,
    convFromPrev: null,
    verdict: "healthy",
    leak: "47,000 visitors leave without signing up — paid traffic bounces hardest.",
    detail: {
      takeaway: "Traffic volume is fine. Quality from paid channels is the problem.",
      evidence: [
        "Organic visitors sign up at 4.1%; Google Ads visitors at 0.6%.",
        "Ad copy promises \"free billing\" — the landing page sells an invoicing suite.",
      ],
      fix: "Match ad promise to page promise before buying more traffic.",
    },
  },
  {
    id: "fs-signups",
    name: "Signups",
    count: 1240,
    convFromPrev: 2.6,
    verdict: "watch",
    leak: "828 signups never reach the first invoice (drop at onboarding step 2).",
    detail: {
      takeaway: "Signup rate is average for B2B SaaS. The next joint is the expensive one.",
      evidence: [
        "1,240 signups in 30 days, 67% of them from content + email.",
        "Signup→activation has fallen 6 pts since the new onboarding shipped.",
      ],
      fix: "Ship the 3-field onboarding variant; kill the GST-details step until after first invoice.",
    },
  },
  {
    id: "fs-activated",
    name: "Activated",
    count: 412,
    convFromPrev: 33.2,
    verdict: "leaking",
    leak: "144 activated accounts go quiet within 30 days.",
    detail: {
      takeaway: "This is the biggest non-spend lever: 33% activation vs 45% target.",
      evidence: [
        "Step-2 drop accounts for 71% of all onboarding abandonment.",
        "Accounts that send one invoice in week 1 retain at 81%.",
      ],
      fix: "Move the sample-invoice moment to minute one; email nudge at hour 24.",
    },
  },
  {
    id: "fs-retained",
    name: "Retained (30d)",
    count: 268,
    convFromPrev: 65,
    verdict: "healthy",
    leak: null,
    detail: {
      takeaway: "65% thirty-day retention beats your 60% target — the product holds.",
      evidence: [
        "Retention is strongest for content-sourced customers (78%).",
        "Churned accounts skew to ad-sourced signups who never activated properly.",
      ],
      fix: "Nothing to fix here. Protect it: keep the day-5 case-study email.",
    },
  },
];

export const funnelTakeaway =
  "The funnel doesn't leak evenly — activation is where customers actually go missing.";
