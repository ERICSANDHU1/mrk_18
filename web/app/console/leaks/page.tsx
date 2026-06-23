import type { Metadata } from "next";
import DashboardFrame from "@/components/app/dashboard/DashboardFrame";
import PageHeader from "@/components/dashboard/PageHeader";
import ConnectDataState from "@/components/dashboard/ConnectDataState";

export const metadata: Metadata = { title: "Leaks" };

export default function LeaksPage() {
  return (
    <DashboardFrame>
      <PageHeader
        eyebrow="Watchdog"
        title="Where money is draining"
        sub="Wasted spend and silent drop-offs your CMO flags once your numbers are flowing."
      />
      <ConnectDataState metric="Where your money is draining" />
    </DashboardFrame>
  );
}
