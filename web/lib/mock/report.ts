import type { WeeklyReport } from "./types";

export const weeklyReports: WeeklyReport[] = [
  {
    id: "wr-2026-06-08",
    week: "2 – 8 Jun 2026",
    verdict: "Busy week, flat results — the leak is still Google Ads.",
    confidence: "high",
    reviewed: false,
    sections: [
      {
        kind: "worked",
        title: "What worked",
        body: [
          "Content did the heavy lifting again. The Zoho-comparison page brought 214 visitors and 4 paying customers this week — your cheapest acquisition at roughly ₹2,000 each, and these customers retain at 78% after 30 days.",
          "Meta retargeting stayed boring in the best way: 3 customers at ₹3,714, sixth week in its target band. Don't touch it.",
        ],
        metricLabel: "Content CAC",
        metricValue: "₹2,000",
        chart: [
          { label: "11 May", value: 2 },
          { label: "18 May", value: 3 },
          { label: "25 May", value: 3 },
          { label: "1 Jun", value: 4 },
          { label: "8 Jun", value: 4 },
        ],
        chartTakeaway: "Customers from content, weekly — slow, cheap, compounding.",
      },
      {
        kind: "leaking",
        title: "What's leaking money",
        body: [
          "Google Ads burned ₹15,800 this week for 1 customer. The same 14 broad-match keywords keep buying \"free invoice template\" traffic that bounces in under 20 seconds. Over a month this is ₹42,000 of spend with nothing attached to it.",
          "LinkedIn stays on watch: right people, wrong offer. Two weeks left on the ROI-calculator test before a verdict.",
        ],
        metricLabel: "Wasted this week",
        metricValue: "₹11,900",
        chart: [
          { label: "11 May", value: 9800 },
          { label: "18 May", value: 10400 },
          { label: "25 May", value: 11200 },
          { label: "1 Jun", value: 11600 },
          { label: "8 Jun", value: 11900 },
        ],
        chartTakeaway: "Weekly waste in paid search — rising while you read this.",
      },
      {
        kind: "next",
        title: "What to do next",
        body: [
          "One move beats ten: pause the 14 broad-match keywords (5 minutes in Google Ads, the list is on your Execute board). That alone recovers most of the leak without losing a single converting term.",
          "Second: ship the 3-field onboarding variant. 828 signups never reached their first invoice this month — activation, not traffic, is your bottleneck.",
        ],
        metricLabel: "Recoverable",
        metricValue: "₹42,000/mo",
        chart: [
          { label: "Pause keywords", value: 42000 },
          { label: "Shift LinkedIn", value: 9500 },
          { label: "Fix activation", value: 28000 },
        ],
        chartTakeaway: "Expected monthly value of the three open moves, in rupees.",
      },
    ],
  },
  {
    id: "wr-2026-06-01",
    week: "26 May – 1 Jun 2026",
    verdict: "Content compounds, paid stalls — shift the next rupee to SEO.",
    confidence: "high",
    reviewed: true,
    sections: [],
  },
  {
    id: "wr-2026-05-25",
    week: "19 – 25 May 2026",
    verdict: "Activation slipped 3 points — onboarding change is the suspect.",
    confidence: "medium",
    reviewed: true,
    sections: [],
  },
];

export const currentReport = weeklyReports[0];
