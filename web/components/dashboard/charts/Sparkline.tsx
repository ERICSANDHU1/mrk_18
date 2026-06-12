"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import type { Verdict } from "@/lib/mock/types";

const STATUS_COLOR: Record<Verdict, string> = {
  healthy: "var(--good)",
  watch: "var(--watch)",
  leaking: "var(--bad)",
};

/** Tiny status-colored trend — proof, not headline. */
export default function Sparkline({
  data,
  verdict,
  label,
  height = 44,
}: {
  data: { label: string; value: number }[];
  verdict: Verdict;
  /** text alternative for screen readers */
  label: string;
  height?: number;
}) {
  const color = STATUS_COLOR[verdict];
  const id = `spark-${verdict}-${data.length}-${Math.round(data[0]?.value ?? 0)}-${Math.round(
    data[data.length - 1]?.value ?? 0,
  )}`;
  return (
    <figure role="img" aria-label={label} className="m-0" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#${id})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </figure>
  );
}
