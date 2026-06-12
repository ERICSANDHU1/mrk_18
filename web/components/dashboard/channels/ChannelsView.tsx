"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import EmptyState from "../EmptyState";
import Panel from "../Panel";
import StatusChip from "../StatusChip";
import Takeaway from "../Takeaway";
import Sparkline from "../charts/Sparkline";
import { formatCompactINR, formatINR } from "@/lib/format";
import type { Channel } from "@/lib/mock/types";

type Lens = "results" | "activity";
type Range = 4 | 8 | 12;

const RANGES: { weeks: Range; label: string }[] = [
  { weeks: 4, label: "30d" },
  { weeks: 8, label: "60d" },
  { weeks: 12, label: "90d" },
];

const KIND_LABEL: Record<Channel["kind"], string> = {
  paid: "Paid",
  organic: "Organic",
  owned: "Owned",
};

/** Channel cards with the brand question built in: is this activity, or a result? */
export default function ChannelsView({ channels }: { channels: Channel[] }) {
  const [lens, setLens] = useState<Lens>("results");
  const [range, setRange] = useState<Range>(8);

  if (channels.length === 0) {
    return (
      <EmptyState
        title="No channels to judge yet"
        body="Connect a source and your CMO will deliver the first channel verdict within a day."
      />
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* the lens toggle — recolors every metric below */}
        <div
          role="radiogroup"
          aria-label="Metric lens"
          className="inline-flex rounded-lg border border-stroke-2 bg-surface p-0.5"
        >
          {(["results", "activity"] as const).map((l) => (
            <button
              key={l}
              role="radio"
              aria-checked={lens === l}
              onClick={() => setLens(l)}
              className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors duration-200 ${
                lens === l ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {l === "results" ? "Results lens" : "Activity lens"}
            </button>
          ))}
        </div>
        <div
          role="radiogroup"
          aria-label="Date range"
          className="inline-flex rounded-lg border border-stroke-2 bg-surface p-0.5"
        >
          {RANGES.map((r) => (
            <button
              key={r.weeks}
              role="radio"
              aria-checked={range === r.weeks}
              onClick={() => setRange(r.weeks)}
              className={`rounded-md px-3 py-1.5 font-mono text-[12px] font-semibold transition-colors duration-200 ${
                range === r.weeks ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-4 text-[13px] text-muted">
        {lens === "results"
          ? "Results lens: customers and CAC lead — spend is context."
          : "Activity lens: what you shipped and spent — none of it counts until the results lens agrees."}
      </p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {channels.map((ch, i) => {
          const series = ch.series.slice(-range);
          const spark = series.map((p) => ({
            label: p.label,
            value: lens === "results" ? p.results : p.activity,
          }));
          const sparkVerdict = lens === "results" ? ch.verdict : "watch";
          const periodResults = series.reduce((s, p) => s + p.results, 0);
          const periodActivity = series.reduce((s, p) => s + p.activity, 0);
          const periodSpend = series.reduce((s, p) => s + p.spend, 0);

          const em = "font-mono text-[15px] font-semibold";
          const dim = "font-mono text-[15px] text-muted/70";

          return (
            <Panel key={ch.id} delay={i + 1} className="flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-[15px] font-bold tracking-tight">{ch.name}</h2>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted">
                    {KIND_LABEL[ch.kind]}
                  </p>
                </div>
                <StatusChip verdict={ch.verdict} />
              </div>

              <div className="mt-3">
                <Takeaway>{ch.takeaway}</Takeaway>
                <Sparkline
                  data={spark}
                  verdict={lens === "results" ? sparkVerdict : "watch"}
                  label={`${ch.name}: ${lens === "results" ? "customers" : "activity"} over the last ${range} weeks`}
                />
              </div>

              <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-stroke-2 pt-3.5">
                <div>
                  <dt className="text-[11px] text-muted">Spend</dt>
                  <dd className={lens === "activity" ? em : dim}>{formatCompactINR(periodSpend)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted">Customers</dt>
                  <dd className={lens === "results" ? em : dim}>{periodResults}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted">{lens === "results" ? "CAC" : "Shipped"}</dt>
                  <dd className={em}>
                    {lens === "results"
                      ? periodResults > 0
                        ? formatINR(Math.round(periodSpend / periodResults))
                        : "—"
                      : `${periodActivity}×`}
                  </dd>
                </div>
              </dl>

              {ch.verdict !== "healthy" && (
                <Link
                  href="/leaks"
                  className="mt-3.5 inline-flex items-center gap-1 text-[12px] font-bold text-amber transition-opacity duration-200 hover:opacity-80"
                >
                  See the leak breakdown
                  <ArrowRight size={12} aria-hidden />
                </Link>
              )}
            </Panel>
          );
        })}
      </div>
    </>
  );
}
