"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import StartRunButton from "./StartRunButton";

type Run = {
  run_id: string;
  status: string;
  cost_inr: number;
  started_at: string;
  finished_at: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  generating: "Researching",
  awaiting_gate1: "Awaiting your review",
  generating_content: "Writing content",
  awaiting_gate2: "Awaiting your approval",
  publishing: "Publishing",
  done: "Done",
  failed: "Failed",
};

function fmtDate(s: string): string {
  try {
    return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

/** Real run history for the workspace — resume a pending run or re-open a finished one. */
export default function CoworkRuns() {
  const [runs, setRuns] = useState<Run[] | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/runs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => active && setRuns(Array.isArray(d) ? d : []))
      .catch(() => active && setRuns([]));
    return () => {
      active = false;
    };
  }, []);

  if (runs === null) {
    return (
      <div className="mt-4 flex justify-center rounded-xl border border-line bg-surface py-10">
        <Loader2 className="animate-spin text-mute-2" size={20} aria-hidden />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-line bg-surface/40 p-6 text-center">
        <span className="mb-3 inline-grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface-2 text-molten">
          <Sparkles size={18} aria-hidden />
        </span>
        <h3 className="text-[14px] font-bold tracking-tight">No campaigns yet</h3>
        <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-mute">
          Your first strategy run will generate a brief, platform-native posts and a content calendar
          from your company memory — each one waiting for your approval.
        </p>
        <div className="flex justify-center">
          <StartRunButton />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-bold tracking-tight">Your runs</h2>
        <StartRunButton />
      </div>
      <ul className="space-y-2">
        {runs.map((r) => {
          const terminal = r.status === "done" || r.status === "failed";
          const needsYou = r.status === "awaiting_gate1" || r.status === "awaiting_gate2";
          return (
            <li key={r.run_id}>
              <Link
                href={`/cowork/run/${r.run_id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-3 transition-colors duration-150 hover:border-molten/30"
              >
                <span className="flex items-center gap-2.5 text-[13px]">
                  {r.status === "failed" ? (
                    <TriangleAlert size={14} className="text-ember" aria-hidden />
                  ) : terminal ? (
                    <Check size={14} className="text-molten" aria-hidden />
                  ) : (
                    <Loader2 size={14} className="animate-spin text-mute-2" aria-hidden />
                  )}
                  <span className="font-semibold">{STATUS_LABEL[r.status] ?? r.status}</span>
                  <span className="text-mute-2">· {fmtDate(r.started_at)}</span>
                </span>
                <span className="inline-flex items-center gap-2">
                  {needsYou && (
                    <span className="rounded-full bg-molten/15 px-2 py-0.5 text-[11px] font-bold text-molten">
                      Review
                    </span>
                  )}
                  <ArrowRight size={14} className="text-mute-2" aria-hidden />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
