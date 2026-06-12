import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatDelta } from "@/lib/format";

/** Trend pill: direction + whether that direction is good for this metric. */
export default function TrendBadge({
  pct,
  lowerIsBetter = false,
  suffix = "vs last period",
}: {
  pct: number;
  lowerIsBetter?: boolean;
  suffix?: string;
}) {
  const flat = pct === 0;
  const good = flat ? null : lowerIsBetter ? pct < 0 : pct > 0;
  const cls = flat ? "text-muted bg-white/5" : good ? "text-good bg-good/10" : "text-bad bg-bad/10";
  const Icon = flat ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[11px] font-semibold ${cls}`}
      >
        <Icon size={12} strokeWidth={2.5} aria-hidden />
        {formatDelta(pct)}
      </span>
      <span className="text-[11px] text-muted">{suffix}</span>
    </span>
  );
}
