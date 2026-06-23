import { statStrip } from "@/lib/mock/console";

/** Top stat strip — the at-a-glance pulse of the workspace. */
export default function StatStrip() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
      {statStrip.map((s) => (
        <div key={s.label} className="rounded-xl border border-line bg-surface p-3.5">
          <p className="text-[11px] font-medium text-mute">{s.label}</p>
          <p className="font-data mt-1.5 text-2xl font-semibold tracking-tight">{s.value}</p>
          <p className={`mt-0.5 text-[11px] font-semibold ${s.good ? "text-molten" : "text-amber"}`}>
            {s.delta}
          </p>
        </div>
      ))}
    </div>
  );
}
