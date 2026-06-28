import { Crown } from "lucide-react";

/** Placeholder — the Chief command center lands here. */
export default function ChiefPage() {
  return (
    <div className="dash-scroll mx-auto h-full max-w-3xl overflow-y-auto px-6 py-12 sm:px-8">
      <span className="grid h-12 w-12 place-items-center rounded-2xl border border-molten/30 bg-molten/10 text-molten">
        <Crown size={22} aria-hidden />
      </span>
      <p className="font-data mt-6 text-[11px] uppercase tracking-[0.22em] text-mute-2">Chief</p>
      <h1 className="font-display mt-2 text-[34px] leading-tight sm:text-[44px]">Your command center</h1>
      <p className="mt-3 max-w-md text-[14px] leading-relaxed text-mute">
        A single, at-a-glance read on what matters this week — pulled together by your CMO.{" "}
        <span className="text-ink">Coming soon.</span>
      </p>
      <div className="mt-9 grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-line bg-surface p-5">
            <div className="h-3 w-1/2 rounded-full bg-surface-2" />
            <div className="mt-3 h-20 rounded-xl bg-surface-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
