import { rollup } from "@/lib/mock/console";

function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** Live / launched roll-up — everything currently in market, by lane. */
export default function LiveRollup() {
  return (
    <section id="rollup" className="scroll-mt-4">
      <h2 className="mb-3 text-[15px] font-bold tracking-tight">Live now</h2>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { label: "Published", value: rollup.published },
            { label: "Scheduled", value: rollup.scheduled },
            { label: "Reach 7d", value: fmt(rollup.reach7) },
            { label: "Reach 30d", value: fmt(rollup.reach30) },
          ].map((m) => (
            <div key={m.label} className="rounded-xl border border-line bg-surface p-3.5">
              <p className="text-[11px] text-mute">{m.label}</p>
              <p className="font-data mt-1 text-xl font-semibold">{m.value}</p>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-line bg-surface p-3.5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-mute-2">
            Follower Δ by lane
          </p>
          <ul className="space-y-2.5">
            {rollup.lanes.map((l) => (
              <li key={l.lane} className="flex items-center justify-between">
                <span className="text-[12px] font-semibold">{l.lane}</span>
                <span className="flex items-baseline gap-2">
                  <span className="font-data text-[13px]">{fmt(l.followers)}</span>
                  <span className="font-data text-[11px] font-semibold text-molten">+{l.delta}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
