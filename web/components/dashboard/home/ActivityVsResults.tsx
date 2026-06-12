"use client";

import Panel from "../Panel";
import Takeaway from "../Takeaway";
import ActivityResultsChart from "../charts/ActivityResultsChart";
import type { ActivityResultPoint } from "@/lib/mock/types";

/** Brand concept as a panel: effort is grey, only results earn a color. */
export default function ActivityVsResults({
  data,
  takeaway,
  delay = 0,
}: {
  data: ActivityResultPoint[];
  takeaway: string;
  delay?: number;
}) {
  return (
    <Panel eyebrow="Activity vs results" title="Busy ≠ growing" delay={delay} className="h-full">
      <Takeaway>{takeaway}</Takeaway>
      <ActivityResultsChart data={data} resultsFlat ariaLabel={takeaway} />
    </Panel>
  );
}
