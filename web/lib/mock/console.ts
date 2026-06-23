/** Mock data for the MRK18 app shell (Dashboard + Cowork). Swap for the real API later. */

export type Lane = "THE FIELD" | "THE WORKSHOP" | "Company";
export type AngleStatus = "scaling" | "watching" | "killed";

export interface Tenant {
  id: string;
  name: string;
  initial: string;
}

export const tenants: Tenant[] = [
  { id: "t-arc", name: "Arc Invoicing", initial: "A" },
  { id: "t-demo", name: "mrk18 demo", initial: "m" },
];

export interface StatItem {
  label: string;
  value: string;
  delta: string;
  good: boolean;
}

export const statStrip: StatItem[] = [
  { label: "Published / 7d", value: "23", delta: "+6", good: true },
  { label: "Reach / 7d", value: "84.2k", delta: "+18%", good: true },
  { label: "Engagement", value: "5.1%", delta: "+0.4", good: true },
  { label: "Pending approvals", value: "7", delta: "3 urgent", good: false },
  { label: "Followers Δ", value: "+412", delta: "this week", good: true },
];

export interface Approval {
  id: string;
  kind: "post" | "reply" | "campaign";
  title: string;
  platform: string;
  lane: Lane;
  snippet: string;
  scheduledFor: string;
  urgent: boolean;
}

export const approvals: Approval[] = [
  {
    id: "ap-1",
    kind: "post",
    title: "LinkedIn — \"The invoice that paid for itself\"",
    platform: "LinkedIn",
    lane: "THE FIELD",
    snippet:
      "Most founders treat invoicing as admin. The sharp ones treat it as the fastest cash-flow lever they own. Here's the 3-line setup…",
    scheduledFor: "Today, 6:30 PM IST",
    urgent: true,
  },
  {
    id: "ap-2",
    kind: "reply",
    title: "Reply to @priyacfo on the GST thread",
    platform: "X",
    lane: "THE FIELD",
    snippet:
      "Great question — yes, the e-invoice IRN is auto-generated. You don't touch the portal. Want the 90-second walkthrough?",
    scheduledFor: "Send now",
    urgent: true,
  },
  {
    id: "ap-3",
    kind: "post",
    title: "Instagram Reel — \"3 invoicing mistakes\"",
    platform: "Instagram",
    lane: "THE WORKSHOP",
    snippet: "Hook: \"You're losing ₹40k a month and your invoice is the reason.\" 18s, captioned.",
    scheduledFor: "Tomorrow, 11:00 AM",
    urgent: true,
  },
  {
    id: "ap-4",
    kind: "campaign",
    title: "Campaign — \"Founder-to-founder\" angle test",
    platform: "LinkedIn + X",
    lane: "Company",
    snippet: "5-post sequence testing peer-proof positioning vs the product-led one. Budget ₹0 (organic).",
    scheduledFor: "Starts Mon",
    urgent: false,
  },
];

export interface Campaign {
  id: string;
  name: string;
  platforms: string[];
  status: "running" | "paused" | "done";
  daysLive: number;
  reach: number;
  engagementRate: number;
  spend: number;
  trend: number[];
}

export const campaigns: Campaign[] = [
  {
    id: "c-1",
    name: "Cash-flow lever",
    platforms: ["LinkedIn", "X"],
    status: "running",
    daysLive: 9,
    reach: 38200,
    engagementRate: 6.4,
    spend: 0,
    trend: [12, 18, 22, 26, 31, 40, 44, 52, 61],
  },
  {
    id: "c-2",
    name: "GST without tears",
    platforms: ["X", "Instagram"],
    status: "running",
    daysLive: 14,
    reach: 21400,
    engagementRate: 4.1,
    spend: 24000,
    trend: [8, 9, 11, 10, 12, 12, 13, 12, 14],
  },
  {
    id: "c-3",
    name: "Comparison: Arc vs Zoho",
    platforms: ["LinkedIn"],
    status: "running",
    daysLive: 21,
    reach: 15600,
    engagementRate: 7.2,
    spend: 0,
    trend: [4, 6, 7, 9, 11, 13, 14, 15, 16],
  },
  {
    id: "c-4",
    name: "Reel: 3 mistakes",
    platforms: ["Instagram"],
    status: "paused",
    daysLive: 6,
    reach: 9200,
    engagementRate: 2.3,
    spend: 6000,
    trend: [3, 4, 3, 4, 3, 3, 2, 2, 2],
  },
];

export interface Angle {
  id: string;
  name: string;
  status: AngleStatus;
  metricLabel: string;
  metricValue: string;
  bars: number[];
}

export const angles: Angle[] = [
  {
    id: "an-1",
    name: "Cash-flow lever",
    status: "scaling",
    metricLabel: "eng. rate",
    metricValue: "6.4%",
    bars: [30, 45, 52, 61, 74, 88],
  },
  {
    id: "an-2",
    name: "Peer-proof (founder-to-founder)",
    status: "scaling",
    metricLabel: "saves/1k",
    metricValue: "18",
    bars: [22, 28, 35, 44, 56, 70],
  },
  {
    id: "an-3",
    name: "Comparison pages",
    status: "watching",
    metricLabel: "CTR",
    metricValue: "2.1%",
    bars: [40, 38, 42, 41, 44, 43],
  },
  {
    id: "an-4",
    name: "GST explainer",
    status: "watching",
    metricLabel: "eng. rate",
    metricValue: "4.1%",
    bars: [35, 33, 36, 34, 32, 33],
  },
  {
    id: "an-5",
    name: "Fear-based (\"you're losing money\")",
    status: "killed",
    metricLabel: "unfollows",
    metricValue: "▲ high",
    bars: [60, 48, 40, 30, 22, 12],
  },
  {
    id: "an-6",
    name: "Feature-dump posts",
    status: "killed",
    metricLabel: "eng. rate",
    metricValue: "0.9%",
    bars: [40, 30, 26, 18, 14, 9],
  },
];

export interface TopComment {
  id: string;
  author: string;
  platform: string;
  snippet: string;
  onPost: string;
  suggestedReply: string;
  sentiment: "positive" | "question" | "negative";
}

export const topComments: TopComment[] = [
  {
    id: "cm-1",
    author: "Priya · CFO",
    platform: "LinkedIn",
    snippet: "This is the first invoicing thread that didn't bore me. Does it handle multi-GSTIN?",
    onPost: "The invoice that paid for itself",
    suggestedReply:
      "Appreciate that, Priya. Yes — multi-GSTIN is native, you switch entity per invoice. Want me to send the 2-min demo?",
    sentiment: "question",
  },
  {
    id: "cm-2",
    author: "@bootstrapped_raj",
    platform: "X",
    snippet: "Switched from spreadsheets last month. The e-invoice IRN thing alone saved my accountant a day.",
    onPost: "GST without tears",
    suggestedReply: "That's exactly the win we built it for, Raj. Mind if we quote this (with credit) in a post?",
    sentiment: "positive",
  },
  {
    id: "cm-3",
    author: "Anonymous",
    platform: "Instagram",
    snippet: "Looks expensive for a small shop tbh.",
    onPost: "Reel: 3 mistakes",
    suggestedReply:
      "Fair worry — there's a free tier for under 50 invoices/mo, no card. Happy to show you if useful.",
    sentiment: "negative",
  },
];

export interface LaneRollup {
  lane: Lane;
  followers: number;
  delta: number;
}

export const rollup = {
  published: 23,
  scheduled: 11,
  reach7: 84200,
  reach30: 312000,
  lanes: [
    { lane: "THE FIELD", followers: 8420, delta: 240 },
    { lane: "THE WORKSHOP", followers: 3110, delta: 132 },
    { lane: "Company", followers: 1290, delta: 40 },
  ] as LaneRollup[],
};

export interface ChatMsg {
  id: string;
  role: "cmo" | "founder";
  text: string;
  time: string;
}

export const cmoChat: ChatMsg[] = [
  {
    id: "ch-1",
    role: "cmo",
    text: "Morning. The cash-flow-lever angle is scaling — 6.4% engagement, best of the six. I want to pour the next 5 posts into it. Good?",
    time: "08:12",
  },
  { id: "ch-2", role: "founder", text: "Yes. But keep one comparison post in the mix.", time: "08:14" },
  {
    id: "ch-3",
    role: "cmo",
    text: "Done. Killed the fear-based angle — it was driving unfollows. The peer-proof one is the surprise winner, so I drafted a founder-to-founder sequence for you to approve.",
    time: "08:15",
  },
  {
    id: "ch-4",
    role: "founder",
    text: "Why did fear-based fail? I thought urgency works.",
    time: "08:20",
  },
  {
    id: "ch-5",
    role: "cmo",
    text: "Urgency works on warm audiences. Cold founders read \"you're losing money\" as a threat from a stranger and leave. Peer-proof earns the same urgency without the defensiveness.",
    time: "08:21",
  },
];

export interface Belief {
  id: string;
  layer: "knows" | "thinks" | "commands";
  text: string;
  evidence: string;
}

export const beliefs: Belief[] = [
  {
    id: "b-1",
    layer: "knows",
    text: "The core buyer is a 1–10 person Indian SaaS/services founder doing their own invoicing.",
    evidence: "From intake + 1,240 signups: 67% self-serve, titles skew founder/ops.",
  },
  {
    id: "b-2",
    layer: "knows",
    text: "Comparison-page visitors convert ~4% and retain best (78% at 30d).",
    evidence: "Stripe + GA join across 21 days of the Arc-vs-Zoho campaign.",
  },
  {
    id: "b-3",
    layer: "thinks",
    text: "Peer-proof positioning beats product-led positioning for cold reach.",
    evidence: "Founder-to-founder angle: 18 saves/1k vs 6 for feature-dump. 9 days of data.",
  },
  {
    id: "b-4",
    layer: "thinks",
    text: "Fear/urgency hooks repel cold founders even when CTR looks fine.",
    evidence: "Fear angle drove high unfollows despite mid CTR — killed after 6 days.",
  },
  {
    id: "b-5",
    layer: "commands",
    text: "Push the cash-flow-lever and peer-proof angles. Hold comparison at one post/week.",
    evidence: "Current scale/kill verdicts from the angle grid.",
  },
  {
    id: "b-6",
    layer: "commands",
    text: "Never auto-send replies — every comment reply waits for founder approval.",
    evidence: "Founder rule, set at onboarding.",
  },
];

export interface WorkspaceDoc {
  id: string;
  title: string;
  type: "brief" | "calendar" | "draft";
  updated: string;
  snippet: string;
}

export const workspaceDocs: WorkspaceDoc[] = [
  {
    id: "w-1",
    title: "June campaign brief — \"Cash-flow lever\"",
    type: "brief",
    updated: "2 h ago",
    snippet:
      "Goal: 30 qualified signups from organic by month-end. Lead angle: invoicing as a cash-flow lever, not admin. Channels: LinkedIn (founder), X (operator). 5-post arc + 2 comparison pages.",
  },
  {
    id: "w-2",
    title: "Content calendar — week of 16 Jun",
    type: "calendar",
    updated: "5 h ago",
    snippet: "Mon LinkedIn · Tue X thread · Wed Reel · Thu comparison · Fri founder-to-founder. CMO sequenced for the 6:30 PM IST window.",
  },
  {
    id: "w-3",
    title: "Draft — \"Founder-to-founder\" sequence",
    type: "draft",
    updated: "just now",
    snippet: "Post 1/5 ready for review. Peer-proof voice, no product mention until post 3. CMO drafted from the winning angle.",
  },
];

export const retrain = { daysLeft: 12, signalsFolded: 38 };
