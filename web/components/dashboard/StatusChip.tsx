import type { Verdict } from "@/lib/mock/types";

const STYLES: Record<Verdict, { label: string; cls: string; dot: string }> = {
  healthy: { label: "Healthy", cls: "text-good border-good/25 bg-good/10", dot: "bg-good" },
  watch: { label: "Watch", cls: "text-watch border-watch/25 bg-watch/10", dot: "bg-watch" },
  leaking: { label: "Leaking", cls: "text-bad border-bad/25 bg-bad/10", dot: "bg-bad" },
};

/** Status = color, color = status. Never decorative. */
export default function StatusChip({
  verdict,
  label,
  className = "",
}: {
  verdict: Verdict;
  label?: string;
  className?: string;
}) {
  const s = STYLES[verdict];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${s.cls} ${className}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {label ?? s.label}
    </span>
  );
}
