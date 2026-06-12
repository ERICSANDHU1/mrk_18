"use client";

type TipEntry = {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
};

/** Shared dark tooltip for every recharts surface. */
export default function ChartTip({
  active,
  payload,
  label,
  format = (v: number) => String(v),
}: {
  active?: boolean;
  payload?: TipEntry[];
  label?: string | number;
  format?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-stroke-2 bg-surface-2 px-3 py-2 shadow-xl">
      {label !== undefined && (
        <p className="mb-1 text-[11px] uppercase tracking-[0.12em] text-muted">{label}</p>
      )}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 font-mono text-[12px] text-ink">
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{ background: p.color ?? "var(--muted)" }}
          />
          <span className="text-muted">{p.name}</span>
          <span className="font-semibold">{typeof p.value === "number" ? format(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
}
