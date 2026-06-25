import type { Metadata } from "next";
import DashboardFrame from "@/components/app/dashboard/DashboardFrame";
import PageHeader from "@/components/dashboard/PageHeader";
import ConnectDataState from "@/components/dashboard/ConnectDataState";

export const metadata: Metadata = { title: "Funnel" };

export default function FunnelPage() {
  return (
    <DashboardFrame>
      <PageHeader
        eyebrow="Where customers go missing"
        title="Funnel"
        sub="Stage-by-stage conversion, stitched from GA4, UTM and Stripe."
      />
      <ConnectDataState metric="Your conversion funnel" />
    </DashboardFrame>
  );
}
