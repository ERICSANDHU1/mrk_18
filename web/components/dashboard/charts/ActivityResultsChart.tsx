"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ChartTip from "./ChartTip";
import type { ActivityResultPoint } from "@/lib/mock/types";

/**
 * The brand concept as a chart: grey activity bars vs the results line.
 * Activity is neutral by design — only the result earns a status color.
 */
export default function ActivityResultsChart({
  data,
  resultsFlat,
  height = 180,
  ariaLabel,
}: {
  data: ActivityResultPoint[];
  /** flat results = red line (the bitter truth) */
  resultsFlat: boolean;
  height?: number;
  ariaLabel: string;
}) {
  const lineColor = resultsFlat ? "var(--bad)" : "var(--good)";
  return (
    <figure role="img" aria-label={ariaLabel} className="m-0">
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -22 }}>
          <CartesianGrid
            vertical={false}
            stroke="rgba(255,255,255,0.05)"
            strokeDasharray="3 6"
          />
          <XAxis
            dataKey="week"
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={34}
          />
          <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar
            name="Activity shipped"
            dataKey="activity"
            fill="rgba(154,149,140,0.35)"
            radius={[3, 3, 0, 0]}
            maxBarSize={22}
          />
          <Line
            name="New customers"
            dataKey="results"
            stroke={lineColor}
            strokeWidth={2}
            dot={false}
            type="monotone"
          />
        </ComposedChart>
      </ResponsiveContainer>
      <figcaption className="mt-2 flex items-center gap-4 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-[2px] bg-muted/40" /> activity (effort)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-3 rounded" style={{ background: lineColor }} />
          results (customers)
        </span>
      </figcaption>
    </figure>
  );
}
