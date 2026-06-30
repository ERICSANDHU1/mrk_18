"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RotateCcw, Square, TriangleAlert } from "lucide-react";
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

/** Turn a raw backend error into one calm sentence for the founder. */
function friendlyError(error: string | null | undefined): string {
  const e = error ?? "";
  if (/content_items|CheckViolation|reel_script/i.test(e))
    return "Your content was generated, but a save step failed. Retrying picks up right where it stopped — no need to run the analysis again.";
  if (/cost ceiling|cap/i.test(e)) return "This run reached its cost ceiling and stopped.";
  if (/Cancelled by you/i.test(e)) return "You cancelled this run.";
  return "Something went wrong during this run.";
}

export default function RunFlow({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunView | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [flagText, setFlagText] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [pollKey, setPollKey] = useState(0);

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
  }, [runId, pollKey]);

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

  const cancel = async () => {
    setCancelling(true);
    await fetch(`/api/runs/${runId}/cancel`, { method: "POST" }).catch(() => {});
    setCancelling(false);
    // stop polling immediately by flipping to a terminal state
    setRun((r) =>
      r
        ? { ...r, status: "failed", error: "Cancelled by you" }
        : { run_id: runId, status: "failed", cost_inr: 0, tokens_in: 0, tokens_out: 0, report: null, error: "Cancelled by you" },
    );
  };

  const retry = async () => {
    setRetrying(true);
    await fetch(`/api/runs/${runId}/retry`, { method: "POST" }).catch(() => {});
    setRetrying(false);
    // optimistic — flip off the terminal 'failed' state and restart the poll loop,
    // which then picks up the real next phase (Gate 2) within seconds
    setRun((r) => (r ? { ...r, status: "generating_content", error: null } : r));
    setPollKey((k) => k + 1);
  };

  const status = run?.status ?? "loading";
  const working = status in WORKING_COPY;

  // GATE 1 — the intelligence report as a full-page sliding story (breaks out
  // of the centered column to use the whole content area).
  if (status === "awaiting_gate1" && run?.report) {
    return (
      <ReportStory
        report={run.report}
        runId={runId}
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
          <button
            onClick={cancel}
            disabled={cancelling}
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-[12px] font-semibold text-mute transition-colors hover:border-ember/40 hover:text-ember disabled:opacity-50"
          >
            {cancelling ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Square size={12} aria-hidden />}
            Stop this run
          </button>
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
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-mute">
            {friendlyError(run?.error)}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {run?.report && (
              <button
                onClick={retry}
                disabled={retrying}
                className="inline-flex items-center gap-1.5 rounded-lg bg-molten px-5 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {retrying ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RotateCcw size={14} aria-hidden />}
                Retry from where it stopped
              </button>
            )}
            <Link
              href="/cowork"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-4 py-2.5 text-[13px] font-semibold text-mute transition-colors hover:text-ink"
            >
              Start a fresh run
            </Link>
          </div>
          {run?.error && (
            <details className="mx-auto mt-4 max-w-md text-left">
              <summary className="cursor-pointer text-[11px] text-mute-2 hover:text-mute">Technical details</summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-[10px] leading-relaxed text-mute-2">
                {run.error}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
