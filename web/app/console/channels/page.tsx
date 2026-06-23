import type { Metadata } from "next";
import DashboardFrame from "@/components/app/dashboard/DashboardFrame";
import PageHeader from "@/components/dashboard/PageHeader";
import ConnectDataState from "@/components/dashboard/ConnectDataState";

export const metadata: Metadata = { title: "Channels" };

export default function ChannelsPage() {
  return (
    <DashboardFrame>
      <PageHeader
        eyebrow="Performance by source"
        title="Channels"
        sub="Spend, CAC and conversions per channel — from your real ad and payment data."
      />
      <ConnectDataState metric="Per-channel performance (spend, CAC, conversions)" />
    </DashboardFrame>
  );
}
