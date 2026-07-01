import type { Metadata } from "next";
import DashboardFrame from "@/components/app/dashboard/DashboardFrame";
import PageHeader from "@/components/dashboard/PageHeader";
import { Radar } from "lucide-react";

export const metadata: Metadata = { title: "Watchdog" };

/** Watchdog — competitor moves + market shifts. Dormant until the news engine ships. */
export default function WatchdogPage() {
  return (
    <DashboardFrame>
      <PageHeader
        eyebrow="Eyes on the market"
        title="Watchdog"
        sub="Competitor moves, pricing changes and market shifts — read for you, ranked by impact."
      />
      <div className="flex flex-col items-center rounded-2xl border border-line bg-surface px-6 py-14 text-center">
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-line bg-surface-2">
          <Radar size={22} className="text-mute-2" aria-hidden />
        </span>
        <p className="text-[14px] font-semibold text-ink">Coming soon</p>
        <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-mute">
          The watchdog will track your named competitors and your market, and surface only
          the moves worth reacting to — with the CMO&apos;s read on each one.
        </p>
      </div>
    </DashboardFrame>
  );
}
