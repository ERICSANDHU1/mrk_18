import { campaigns, type Campaign } from "@/lib/mock/console";

function Spark({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const w = 96;
  const h = 28;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / (max - min || 1)) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--molten)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const STATUS: Record<Campaign["status"], { label: string; cls: string }> = {
  running: { label: "Running", cls: "border-molten/30 bg-molten/10 text-molten" },
  paused: { label: "Paused", cls: "border-amber/30 bg-amber/10 text-amber" },
  done: { label: "Done", cls: "border-line bg-surface-2 text-mute" },
};

function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** Campaign performance — best performers first, sparkline per campaign. */
export default function CampaignPerformance() {
  const sorted = [...campaigns].sort((a, b) => b.engagementRate - a.engagementRate);
  return (
    <section id="campaigns" className="scroll-mt-4">
      <h2 className="mb-3 text-[15px] font-bold tracking-tight">Campaign performance</h2>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <ul className="divide-y divide-line-soft">
          {sorted.map((c) => {
            const s = STATUS[c.status];
            return (
              <li key={c.id} className="flex items-center gap-4 p-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-[13px] font-bold">{c.name}</h3>
                    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${s.cls}`}>
                      {s.label}
                    </span>
                  </div>
                  <p className="font-data mt-0.5 text-[11px] text-mute-2">
                    {c.platforms.join(" · ")} · {c.daysLive}d live
                  </p>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="font-data text-[13px] font-semibold">{fmt(c.reach)}</p>
                  <p className="text-[10px] text-mute-2">reach</p>
                </div>
                <div className="text-right">
                  <p className="font-data text-[13px] font-semibold text-molten">{c.engagementRate}%</p>
                  <p className="text-[10px] text-mute-2">eng.</p>
                </div>
                <div className="hidden text-right md:block">
                  <p className="font-data text-[13px]">{c.spend > 0 ? `₹${fmt(c.spend)}` : "₹0"}</p>
                  <p className="text-[10px] text-mute-2">spend</p>
                </div>
                <Spark data={c.trend} />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
