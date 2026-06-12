"use client";

import Panel from "../Panel";
import CountUp from "../CountUp";
import StatusChip from "../StatusChip";
import TrendBadge from "../TrendBadge";
import { formatNum } from "@/lib/format";
import type { HeroNumber } from "@/lib/mock/types";

const BAR: Record<HeroNumber["status"], string> = {
  healthy: "bg-good",
  watch: "bg-watch",
  leaking: "bg-bad",
};

/** The one number that matters this month. */
export default function BigNumberCard({ data, delay = 0 }: { data: HeroNumber; delay?: number }) {
  const progress = Math.min(100, Math.round((data.value / data.target) * 100));
  return (
    <Panel eyebrow="The number that matters" delay={delay} className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-semibold leading-snug">{data.label}</p>
        <StatusChip verdict={data.status} />
      </div>
      <p className="mt-3">
        <CountUp
          value={data.value}
          format={(v) => formatNum(Math.round(v))}
          className="font-mono text-5xl font-semibold tracking-tight sm:text-6xl"
        />
        <span className="ml-2 text-sm text-muted">of {formatNum(data.target)} target</span>
      </p>
      <div
        className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${progress}% of target`}
      >
        <div className={`h-full rounded-full ${BAR[data.status]}`} style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-3">
        <TrendBadge pct={data.trendPct} />
      </div>
      <p className="mt-4 border-t border-stroke-2 pt-3 text-[13px] leading-relaxed text-muted">
        {data.takeaway}
      </p>
    </Panel>
  );
}
