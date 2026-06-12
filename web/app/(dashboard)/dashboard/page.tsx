import type { Metadata } from "next";
import VerdictBanner from "@/components/dashboard/home/VerdictBanner";
import BigNumberCard from "@/components/dashboard/home/BigNumberCard";
import NextMoves from "@/components/dashboard/home/NextMoves";
import LeakAlerts from "@/components/dashboard/home/LeakAlerts";
import ActivityVsResults from "@/components/dashboard/home/ActivityVsResults";
import KpiCard from "@/components/dashboard/home/KpiCard";
import {
  activityTakeaway,
  activityVsResults,
  heroNumber,
  kpis,
  leakAlerts,
  nextMoves,
  weekVerdict,
} from "@/lib/mock/home";

export const metadata: Metadata = { title: "This Week" };

/** Home — the decision, then the evidence. 6 elements, nothing more. */
export default function DashboardHome() {
  return (
    <div className="space-y-4">
      <VerdictBanner verdict={weekVerdict} />

      <div className="grid gap-4 lg:grid-cols-3">
        <BigNumberCard data={heroNumber} delay={1} />
        <div className="lg:col-span-2">
          <NextMoves moves={nextMoves} delay={2} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <LeakAlerts alerts={leakAlerts} delay={3} />
        </div>
        <div className="lg:col-span-3">
          <ActivityVsResults data={activityVsResults} takeaway={activityTakeaway} delay={4} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <KpiCard key={k.id} kpi={k} delay={5 + i} />
        ))}
      </div>
    </div>
  );
}
