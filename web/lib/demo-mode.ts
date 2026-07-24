"use client";

import { useUser } from "@clerk/nextjs";
import { hasProAccess } from "./entitlements";

/** Demo mode = a signed-in visitor who is NOT a Founding-500 member. They can
 *  now enter Comrk and Chief and SEE what they do, populated with the sample
 *  data below — the real backend is never called for them, so nothing paid is
 *  exposed. Pro members get the real thing, unchanged.
 *
 *  `ready` gates the first render until Clerk resolves, so we never flash real
 *  fetches for a demo user (or vice-versa). */
export function useDemoMode(): { ready: boolean; demo: boolean } {
  const { isLoaded, user } = useUser();
  if (!isLoaded) return { ready: false, demo: false };
  // `?demo=1` forces the demo even for members — so the founder (who is on the
  // pro allowlist) can preview it without a second account. Read only here,
  // after Clerk has loaded, so it's client-side and can't cause a hydration
  // mismatch (the not-ready branch above renders identically on server + client).
  const forced =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("demo") === "1";
  const pro = hasProAccess(user?.primaryEmailAddress?.emailAddress);
  return { ready: true, demo: forced || !pro };
}

/* ── Chief demo fixtures ──────────────────────────────────────────────────── */

export const CHIEF_DEMO = {
  company: "Acme Labs",
  connections: [
    { platform: "meta", status: "connected" },
    { platform: "google", status: "connected" },
  ],
  analytics: {
    // metrics left null so the honest "Demo data" badge stays on; the KPI row
    // falls back to its sample values
    metrics: null,
    created_at: new Date().toISOString(),
    diagnosis: {
      headline:
        "Meta is carrying you, but blended CAC crept up 18% this week — the new broad lookalike is the culprit.",
      working: [
        "Retargeting ROAS holding at 4.2×",
        "LinkedIn thought-leadership is driving demo requests at ₹0 media cost",
      ],
      leaking: [
        "New Meta 'Broad Lookalike 1%' spending ₹512/CAC vs ₹210 blended",
        "Google Search budget caps out by 2pm — losing afternoon intent",
      ],
      scale: ["Shift ₹40k from the lookalike into retargeting", "Raise Google Search daily cap 30%"],
      cut: ["Pause the broad Meta lookalike until CAC recovers"],
      next_move:
        "Cut the broad lookalike and move its ₹40k into retargeting — recovers about ₹28k this month.",
    },
  },
  chat: [
    { id: "demo-u", role: "user" as const, text: "Why did our CAC go up this week?" },
    {
      id: "demo-c",
      role: "cmo" as const,
      text: "Your blended CAC rose from ₹264 to ₹312 (+18%). It's almost entirely the new Meta 'Broad Lookalike 1%' — it's paying ₹512 to acquire what retargeting gets for ₹210. Pause it, move that ₹40k/mo into retargeting, and blended CAC drops back under ₹270 within a week. Want me to draft the reallocation?",
    },
  ],
};

/* ── Comrk demo fixtures ──────────────────────────────────────────────────── */

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

export const COMRK_DEMO = {
  profile: {
    company_name: "Acme Labs",
    website: "acmelabs.io",
    product_description: "AI analytics that tells e-commerce founders what's actually working.",
    icp: "DTC founders doing ₹50L–₹5Cr a year",
    top_competitors: ["Triple Whale", "Northbeam"],
    tone: "Sharp, founder-to-founder",
    primary_goal: "signups",
    monthly_spend_inr: 150000,
    target_platforms: ["linkedin", "x"],
  },
  runs: [
    { run_id: "demo-r1", status: "awaiting_gate2", started_at: daysAgo(0) },
    { run_id: "demo-r2", status: "awaiting_gate1", started_at: daysAgo(1) },
    { run_id: "demo-r3", status: "completed", started_at: daysAgo(4) },
    { run_id: "demo-r4", status: "completed", started_at: daysAgo(9) },
  ],
  content: [
    {
      item_id: "demo-c1",
      run_id: "demo-r1",
      platform: "linkedin",
      format: "post",
      status: "awaiting_approval",
      body: "Most DTC founders read their ad dashboard wrong. Spend isn't the number that matters — it's what each channel returns after the 3rd purchase. Here's the 4-line audit we run every Monday 👇",
    },
    {
      item_id: "demo-c2",
      run_id: "demo-r1",
      platform: "x",
      format: "post",
      status: "awaiting_approval",
      body: "Your CAC didn't go up. One campaign did. Kill the broad lookalike, feed retargeting, watch blended CAC fall 18%. That's a Tuesday.",
    },
    {
      item_id: "demo-c3",
      run_id: "demo-r2",
      platform: "linkedin",
      format: "reel_script",
      status: "draft",
      body: "HOOK: 'I spent ₹1.4L on ads last month. Here's the only chart that mattered.' — cut to the retargeting ROAS line — ...",
    },
    {
      item_id: "demo-c4",
      run_id: "demo-r3",
      platform: "linkedin",
      format: "post",
      status: "approved",
      body: "We turned off 40% of our ad spend and revenue went UP. The budget was buying clicks, not customers. Full teardown in comments.",
    },
    {
      item_id: "demo-c5",
      run_id: "demo-r3",
      platform: "x",
      format: "post",
      status: "published",
      body: "Founders: your best-performing channel is probably the one you're under-funding because it 'looks small.' Check retargeting ROAS before you touch anything else.",
    },
    {
      item_id: "demo-c6",
      run_id: "demo-r4",
      platform: "instagram",
      format: "post",
      status: "published",
      body: "The 3-purchase rule: don't judge a channel until a cohort has bought 3x. Most founders cut winners at purchase 1.",
    },
  ],
};
