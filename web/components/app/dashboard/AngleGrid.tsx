import { angles, type AngleStatus } from "@/lib/mock/console";

const STATUS: Record<AngleStatus, { label: string; text: string; bar: string; chip: string }> = {
  scaling: { label: "Scaling", text: "text-molten", bar: "bg-molten", chip: "border-molten/30 bg-molten/10 text-molten" },
  watching: { label: "Watching", text: "text-amber", bar: "bg-amber", chip: "border-amber/30 bg-amber/10 text-amber" },
  killed: { label: "Killed", text: "text-ember", bar: "bg-ember", chip: "border-ember/30 bg-ember/10 text-ember" },
};

/** Angle win/lose grid — the closed loop made visible: the system's own scale/kill verdicts. */
export default function AngleGrid() {
  return (
    <section id="angles" className="scroll-mt-4">
      <header className="mb-3 flex items-baseline justify-between">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight">Eagle-View · angle verdicts</h2>
          <p className="text-[12px] text-mute">Which angles the system is scaling, watching, or killing.</p>
        </div>
      </header>
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {angles.map((a) => {
          const s = STATUS[a.status];
          const max = Math.max(...a.bars, 1);
          return (
            <div key={a.id} className="rounded-xl border border-line bg-surface p-3.5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[13px] font-bold leading-snug">{a.name}</h3>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${s.chip}`}>
                  {s.label}
                </span>
              </div>
              <div className="mt-3 flex h-10 items-end gap-1" aria-hidden>
                {a.bars.map((b, i) => (
                  <span
                    key={i}
                    className={`flex-1 rounded-sm ${s.bar} ${a.status === "killed" ? "opacity-50" : ""}`}
                    style={{ height: `${Math.max(8, (b / max) * 100)}%` }}
                  />
                ))}
              </div>
              <p className="mt-2 text-[11px] text-mute">
                {a.metricLabel} <span className={`font-data font-semibold ${s.text}`}>{a.metricValue}</span>
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
