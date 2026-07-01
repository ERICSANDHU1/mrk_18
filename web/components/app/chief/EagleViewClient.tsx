"use client";

import { useEffect, useState } from "react";
import DashboardFrame from "@/components/app/dashboard/DashboardFrame";
import PageHeader from "@/components/dashboard/PageHeader";
import { SkeletonRows } from "@/components/app/ui/Skeleton";

type Rank = { item_id: string; platform: string; body: string; latest_engagement_rate?: number };

const PLATFORM_LABEL: Record<string, string> = {
  meta: "Meta",
  x: "X",
  linkedin: "LinkedIn",
  ig: "Instagram",
  instagram: "Instagram",
  reddit: "Reddit",
  google: "Google",
};

// Shown until real measured posts exist — so the page demonstrates itself.
const DEMO: Rank[] = [
  { item_id: "d1", platform: "linkedin", body: "Your invoices are leaking money — every hour you spend on IRN is an hour not selling.", latest_engagement_rate: 0.062 },
  { item_id: "d2", platform: "x", body: "We watched 40 founders do their own GST filing. All 40 undercharged for their time.", latest_engagement_rate: 0.048 },
  { item_id: "d3", platform: "linkedin", body: "Auto-IRN, no accountant needed: the maths of ₹15K/mo saved.", latest_engagement_rate: 0.041 },
  { item_id: "d4", platform: "instagram", body: "POV: your invoicing runs itself while you close the next deal.", latest_engagement_rate: 0.033 },
  { item_id: "d5", platform: "x", body: "Founders don't need more dashboards. They need one number that says 'you're fine'.", latest_engagement_rate: 0.027 },
];

const pct = (n?: number) => (typeof n === "number" ? `${(n * 100).toFixed(1)}%` : "—");

/** Eagle view — every measured post ranked by engagement, with a visual bar so
 *  the winners are obvious at a glance. Demo rows until real signals arrive. */
export default function EagleViewClient() {
  const [ranking, setRanking] = useState<Rank[] | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/performance", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active) return;
        setRanking(Array.isArray(d?.ranking) ? d.ranking : []);
      })
      .catch(() => {
        if (active) setRanking([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const live = (ranking?.length ?? 0) > 0;
  const rows = live ? ranking! : DEMO;
  const max = Math.max(...rows.map((r) => r.latest_engagement_rate ?? 0), 0.0001);

  return (
    <DashboardFrame>
      <PageHeader
        eyebrow="What actually landed"
        title="Eagle view"
        sub="Every measured post, ranked by engagement — double down on what works."
      />

      {!live && ranking !== null && (
        <p className="-mt-2 mb-4 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[11px] text-mute">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-watch" />
          Demo data — your real posts rank here once published content gathers signals
        </p>
      )}

      <div className="rounded-2xl border border-line bg-surface p-2">
        {ranking === null ? (
          <SkeletonRows rows={5} className="p-2" />
        ) : (
          <div className="divide-y divide-line-soft">
            {rows.map((r, i) => (
              <div key={r.item_id} className="flex items-center gap-3 px-3 py-3">
                <span className="font-data w-5 shrink-0 text-[11px] text-mute-2">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-ink">{r.body || "—"}</p>
                  <div className="mt-1.5 flex items-center gap-2.5">
                    <span className="font-data text-[10.5px] uppercase tracking-wide text-mute-2">
                      {PLATFORM_LABEL[r.platform] ?? r.platform}
                    </span>
                    <span aria-hidden className="h-1.5 max-w-40 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <span
                        className="block h-full rounded-full bg-good"
                        style={{ width: `${Math.max(6, ((r.latest_engagement_rate ?? 0) / max) * 100)}%` }}
                      />
                    </span>
                  </div>
                </div>
                <span className="shrink-0 text-[13px] font-semibold text-good">
                  {pct(r.latest_engagement_rate)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardFrame>
  );
}
