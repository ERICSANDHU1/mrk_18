import type { Metadata } from "next";
import DashboardFrame from "@/components/app/dashboard/DashboardFrame";
import PageHeader from "@/components/dashboard/PageHeader";
import AdAnalyticsPanel from "@/components/dashboard/AdAnalyticsPanel";

export const metadata: Metadata = { title: "Leaks" };

export default function LeaksPage() {
  return (
    <DashboardFrame>
      <PageHeader
        eyebrow="Watchdog"
        title="Where money is draining"
        sub="Wasted spend and silent drop-offs your CMO flags once your numbers are flowing."
      />
      <AdAnalyticsPanel metric="Where your money is draining" />
    </DashboardFrame>
  );
}
