import type { Metadata } from "next";
import DashboardFrame from "@/components/app/dashboard/DashboardFrame";
import PageHeader from "@/components/dashboard/PageHeader";
import AdAnalyticsPanel from "@/components/dashboard/AdAnalyticsPanel";

export const metadata: Metadata = { title: "Channels" };

export default function ChannelsPage() {
  return (
    <DashboardFrame>
      <PageHeader
        eyebrow="Performance by source"
        title="Channels"
        sub="Spend, CAC and conversions per channel — from your real ad and payment data."
      />
      {/* full connector lifecycle: connect → pulled-campaigns review → CMO
          diagnosis. This is where the Meta OAuth callback lands the founder. */}
      <AdAnalyticsPanel metric="Per-channel performance (spend, CAC, conversions)" />
    </DashboardFrame>
  );
}
