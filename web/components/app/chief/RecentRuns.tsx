"use client";

import { History, Trash2 } from "lucide-react";
import type { StoredRun } from "./runsStore";

const fmtWhen = (iso: string) => {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const mins = Math.round((now - d.getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
};

/** The list of saved analytics runs — newest first. Card chrome (rail vs overlay,
 *  collapse) is owned by CsvUpload; this renders just the cards + a summary line. */
export default function RecentRuns({
  runs,
  activeId,
  onSelect,
  onRemove,
}: {
  runs: StoredRun[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <History size={20} className="text-mute-2" aria-hidden />
        <p className="text-[12px] text-mute">No runs yet.</p>
        <p className="text-[11px] leading-relaxed text-mute-2">
          Run an analysis and it&apos;s saved here — click any card to reopen it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {runs.map((r) => {
        const active = r.id === activeId;
        return (
          <div
            key={r.id}
            className={`group relative rounded-xl border transition-colors ${
              active
                ? "border-line border-l-[3px] border-l-molten bg-molten/[0.06]"
                : "border-line bg-surface hover:border-molten/40"
            }`}
          >
            <button
              onClick={() => onSelect(r.id)}
              className="block w-full px-3 py-2.5 text-left"
              aria-current={active ? "true" : undefined}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-ink">Run {r.n}</span>
                <span className="font-data shrink-0 text-[10px] text-mute-2">{fmtWhen(r.updatedAt)}</span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-mute" title={r.fileName}>
                {r.fileName}
              </p>
              <p className="mt-1 text-[11.5px] text-ink/80">
                {r.currency}
                {r.totalSpend.toLocaleString(r.currency === "₹" ? "en-IN" : "en-US", {
                  maximumFractionDigits: 0,
                })}{" "}
                spend · {r.campaignCount} campaign{r.campaignCount === 1 ? "" : "s"}
              </p>
              {!r.output ? (
                <p className="mt-0.5 text-[10.5px] text-watch">not analysed yet</p>
              ) : (
                r.refinedCount > 0 && (
                  <p className="mt-0.5 text-[10.5px] text-mute-2">refined {r.refinedCount}×</p>
                )
              )}
            </button>
            <button
              onClick={() => onRemove(r.id)}
              aria-label={`Delete run ${r.n}`}
              className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md text-mute-2 opacity-0 transition hover:bg-[var(--overlay-subtle)] hover:text-bad focus-visible:opacity-100 group-hover:opacity-100"
            >
              <Trash2 size={12} aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
