"use client";

import Panel from "../Panel";
import CountUp from "../CountUp";
import TrendBadge from "../TrendBadge";
import { formatCompactINR, formatINR, formatNum } from "@/lib/format";
import type { Kpi } from "@/lib/mock/types";

const DOT: Record<Kpi["status"], string> = {
  healthy: "bg-good",
  watch: "bg-watch",
  leaking: "bg-bad",
};

function fmt(kind: Kpi["kind"], v: number): string {
  if (kind === "pct") return `${Math.round(v)}%`;
  if (kind === "num") return formatNum(Math.round(v));
  return v >= 1e5 ? formatCompactINR(v) : formatINR(v);
}

/** One KPI: value + target + trend + status. No chart — proof lives a click away. */
export default function KpiCard({ kpi, delay = 0 }: { kpi: Kpi; delay?: number }) {
  return (
    <Panel delay={delay}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-muted">{kpi.label}</p>
        <span aria-hidden className={`h-2 w-2 rounded-full ${DOT[kpi.status]}`} />
        <span className="sr-only">{kpi.status === "healthy" ? "Healthy" : kpi.status === "watch" ? "Watch" : "Leaking"}</span>
      </div>
      <p className="mt-2.5">
        <CountUp
          value={kpi.value}
          format={(v) => fmt(kpi.kind, v)}
          className="font-mono text-[28px] font-semibold tracking-tight"
        />
      </p>
      <p className="mt-1 text-[11px] text-muted">
        target {fmt(kpi.kind, kpi.target)}
      </p>
      <div className="mt-2.5">
        <TrendBadge pct={kpi.trendPct} lowerIsBetter={kpi.lowerIsBetter} suffix="vs last 30d" />
      </div>
    </Panel>
  );
}
