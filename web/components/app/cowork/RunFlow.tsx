"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, TriangleAlert } from "lucide-react";
import Gate2Review from "./Gate2Review";
import RunDeck from "./RunDeck";
import ReportStory, { type Report } from "./ReportStory";

interface RunView {
  run_id: string;
  status: string;
  cost_inr: number;
  tokens_in: number;
  tokens_out: number;
  report: Report | null;
  error: string | null;
}

const TERMINAL = ["done", "failed"];
const WORKING_COPY: Record<string, string> = {
  generating: "Your CMO is researching your market, audience and content strategy…",
  generating_content: "Approved. Now writing platform-native posts for your review…",
  publishing: "Publishing your approved content…",
};

export default function RunFlow({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunView | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [flagText, setFlagText] = useState("");

  useEffect(() => {
    let active = true;
    let timeout: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const r: RunView | null = await fetch(`/api/runs/${runId}`, { cache: "no-store" })
        .then((x) => x.json())
        .catch(() => null);
      if (!active) return;
      if (r && r.status) setRun(r);
      if (!r || !TERMINAL.includes(r.status)) {
        timeout = setTimeout(poll, 4000);
      }
    };
    poll();
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [runId]);

  const decideGate1 = async (action: "approve" | "flag") => {
    const flags =
      action === "flag" ? flagText.split("\n").map((s) => s.trim()).filter(Boolean) : [];
    if (action === "flag" && flags.length === 0) {
      setFlagging(true);
      return;
    }
    setSubmitting(true);
    await fetch(`/api/runs/${runId}/gate1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, flags }),
    }).catch(() => {});
    setSubmitting(false);
    setFlagging(false);
    setFlagText("");
    // optimistic — the running poll picks up the real next phase within seconds
    setRun((r) => (r ? { ...r, status: "generating_content", report: null } : r));
  };

  const status = run?.status ?? "loading";
  const working = status in WORKING_COPY;

  // GATE 1 — the intelligence report as a full-page sliding story (breaks out
  // of the centered column to use the whole content area).
  if (status === "awaiting_gate1" && run?.report) {
    return (
      <ReportStory
        report={run.report}
        submitting={submitting}
        flagging={flagging}
        flagText={flagText}
        setFlagText={setFlagText}
        onApprove={() => decideGate1("approve")}
        onStartFlag={() => setFlagging(true)}
        onSubmitFlag={() => decideGate1("flag")}
        onCancelFlag={() => {
          setFlagging(false);
          setFlagText("");
        }}
      />
    );
  }

  // DONE — the whole finished run as a swipeable deck (analysis → posts → images).
  if (status === "done") {
    return <RunDeck report={run?.report ?? null} runId={runId} />;
  }

  return (
    <div className="dash-scroll mx-auto h-full max-w-3xl overflow-y-auto px-5 py-7 sm:px-8">
      <header className="mb-6 flex items-center justify-between gap-3">
        <Link
          href="/cowork"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-mute transition-colors duration-150 hover:text-ink"
        >
          <ArrowLeft size={15} aria-hidden /> Workspace
        </Link>
        {run && (
          <span className="font-data text-[11px] text-mute-2">
            {run.tokens_in + run.tokens_out > 0
              ? `${(run.tokens_in + run.tokens_out).toLocaleString()} tokens`
              : ""}
          </span>
        )}
      </header>

      {/* loading / working */}
      {(status === "loading" || working) && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-surface px-6 py-16 text-center">
          <Loader2 className="animate-spin text-molten" size={26} aria-hidden />
          <h1 className="font-display mt-4 text-xl">Your CMO is on it</h1>
          <p className="mt-2 max-w-md text-[13px] leading-relaxed text-mute">
            {WORKING_COPY[status] ?? "Starting your run…"}
          </p>
          <p className="font-data mt-4 text-[10px] uppercase tracking-[0.14em] text-mute-2">
            this takes a minute or two — you can leave and come back
          </p>
        </div>
      )}

      {/* GATE 2 — real per-post approval */}
      {status === "awaiting_gate2" && (
        <Gate2Review
          runId={runId}
          onSubmitted={() => setRun((r) => (r ? { ...r, status: "publishing" } : r))}
        />
      )}

      {status === "failed" && (
        <div className="rounded-2xl border border-ember/30 bg-ember/[0.06] p-6 text-center">
          <TriangleAlert size={22} className="mx-auto text-ember" aria-hidden />
          <h1 className="font-display mt-3 text-xl">This run hit a snag</h1>
          <p className="mt-2 text-[13px] text-mute">
            {run?.error ?? "Something went wrong."} — start a fresh run from your workspace.
          </p>
        </div>
      )}
    </div>
  );
}
