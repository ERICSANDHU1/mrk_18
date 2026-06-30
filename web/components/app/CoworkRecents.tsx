"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SkeletonRows } from "@/components/app/ui/Skeleton";

type Run = { run_id: string; status: string; started_at: string };

const STATUS_LABEL: Record<string, string> = {
  generating: "Researching",
  awaiting_gate1: "Awaiting review",
  generating_content: "Writing content",
  awaiting_gate2: "Awaiting approval",
  publishing: "Publishing",
  done: "Completed",
  failed: "Failed",
};

const fmtDate = (s: string) => {
  try {
    return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
};

/** The Comrk tab's Recents — the signed-in founder's real runs (newest first),
 *  each linking to its run flow. Refreshes when a run is started
 *  (StartRunButton fires "mrk18:runs-changed"). */
export default function CoworkRecents() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = () =>
      fetch("/api/runs", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => active && Array.isArray(d) && setRuns(d as Run[]))
        .catch(() => {})
        .finally(() => active && setLoading(false));
    load();
    const onChange = () => load();
    window.addEventListener("mrk18:runs-changed", onChange);
    return () => {
      active = false;
      window.removeEventListener("mrk18:runs-changed", onChange);
    };
  }, []);

  if (loading) return <SkeletonRows rows={4} className="mt-1.5" />;
  if (runs.length === 0) {
    return <p className="px-2.5 py-2 text-[12.5px] text-mute-2">No runs yet.</p>;
  }

  return (
    <>
      {runs.map((r) => {
        const label = `${STATUS_LABEL[r.status] ?? r.status} · ${fmtDate(r.started_at)}`;
        return (
          <Link
            key={r.run_id}
            href={`/cowork/run/${r.run_id}`}
            title={label}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-mute transition-colors hover:bg-surface hover:text-ink"
          >
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full border border-line" />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </>
  );
}
