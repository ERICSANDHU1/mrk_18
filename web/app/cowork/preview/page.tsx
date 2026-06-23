"use client";

// TEMPORARY preview of the Gate-1 sliding report (ReportStory) with sample data.
// Lets you see the full slide experience without running a real CMO job.
// Safe to delete: this whole `preview/` folder is throwaway.

import { useState } from "react";
import ReportStory, { type Report } from "@/components/app/cowork/ReportStory";

const SAMPLE: Report = {
  synthesis:
    "You're not selling invoicing — you're selling the end of GST anxiety, and right now your " +
    "messaging buries that under feature lists. Indian founders doing their own books don't " +
    "compare invoicing tools on features; they switch the moment compliance breaks and they get " +
    "burned. That's your wedge.\n\n" +
    "The crowded part of this market competes on breadth. You should compete on one sharp promise: " +
    "IRN auto-generated, no portal, no accountant back-and-forth. Your real risk isn't a competitor " +
    "— it's that founders don't believe a small tool can be truly compliant. So your next move is " +
    "trust, not reach: put GSTIN-level proof in front of them — a 60-second 'watch an e-invoice " +
    "generate itself' demo, and one founder story a week showing a filing that didn't break.\n\n" +
    "Lead on LinkedIn, where Indian SaaS founders actually are, with X as secondary reach. Skip " +
    "Instagram for now — it won't convert this buyer. And hold the discount angle: discounting a " +
    "compliance product signals 'cheap and risky,' the opposite of what wins here. Win on " +
    "confidence, not price.",
  market_intel: {
    summary:
      "The GST-invoicing category is mature on features but wide open on trust and onboarding speed. " +
      "Incumbents win on breadth; a challenger wins on a single sharp compliance promise and a " +
      "frictionless first invoice.",
    claims: [
      {
        text: "Incumbents lead on feature breadth, not e-invoicing speed — leaving room for a 'compliance-first, zero-setup' position.",
        confidence: "high",
        source: "intake:competitors",
      },
      {
        text: "E-invoicing (IRN) is mandatory for a widening turnover band, pulling smaller founders into compliance for the first time — a fresh, anxious buyer.",
        confidence: "high",
        source: "market",
      },
      {
        text: "Most switching happens right after a filing breaks, not during calm evaluation — the trigger is urgency, not features.",
        confidence: "medium",
        source: "inferred",
      },
      {
        text: "Price is a weak lever in compliance tools; reliability and trust dominate the decision.",
        confidence: "medium",
        source: "reasoning",
      },
    ],
  },
  audience_positioning: {
    summary:
      "Your sharpest buyer is the solo or small-team Indian SaaS/services founder doing their own " +
      "invoicing — time-poor, compliance-anxious, and burned once before. Position on confidence, " +
      "not cost.",
    claims: [
      {
        text: "Primary ICP: 1-10 person founders in tier-1/2 cities who self-manage GST — they feel the pain directly and decide fast.",
        confidence: "high",
        source: "intake:icp",
      },
      {
        text: "They care about 'will my filing break?' far more than dashboards or reports.",
        confidence: "high",
        source: "intake:product",
      },
      {
        text: "Position against breadth-players as 'the tool that does the one scary thing perfectly' — never attack a competitor by name.",
        confidence: "medium",
        source: "reasoning",
      },
      {
        text: "Multi-GSTIN founders are an underserved, high-intent niche worth a dedicated message.",
        confidence: "low",
        source: "inferred",
      },
    ],
  },
  content_strategy: {
    summary:
      "Lead with proof-of-compliance content on LinkedIn and X. One live demo, one founder story, " +
      "one myth-bust per week. Hold discounts; sell confidence.",
    claims: [
      {
        text: "Channel mix: LinkedIn primary (where Indian SaaS founders are) + X secondary for reach. Skip Instagram for this buyer.",
        confidence: "high",
        source: "intake:channels",
      },
      {
        text: "Hero format: a 60-second 'watch an e-invoice generate itself, no portal' demo — show, don't claim.",
        confidence: "medium",
        source: "strategy",
      },
      {
        text: "Weekly cadence: 1 demo, 1 founder proof-story, 1 'GST mistake that costs founders money' explainer.",
        confidence: "medium",
        source: "strategy",
      },
      {
        text: "Avoid discount-led posts — they undercut the trust you're building.",
        confidence: "high",
        source: "reasoning",
      },
    ],
  },
  founder_flags: [],
};

export default function PreviewPage() {
  const [flagging, setFlagging] = useState(false);
  const [flagText, setFlagText] = useState("");
  const [note, setNote] = useState<string | null>(null);

  return (
    <>
      <ReportStory
        report={SAMPLE}
        submitting={false}
        flagging={flagging}
        flagText={flagText}
        setFlagText={setFlagText}
        onApprove={() => setNote("Approve — in a real run this generates your posts.")}
        onStartFlag={() => setFlagging(true)}
        onSubmitFlag={() => {
          setNote(`Flagged: ${flagText.trim() || "(empty)"}`);
          setFlagging(false);
          setFlagText("");
        }}
        onCancelFlag={() => {
          setFlagging(false);
          setFlagText("");
        }}
      />
      {note && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-molten/40 bg-bg/90 px-4 py-2 text-[12px] text-ink backdrop-blur">
          (preview) {note}
        </div>
      )}
    </>
  );
}
