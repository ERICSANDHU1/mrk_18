import type { Metadata } from "next";
import PageHeader from "@/components/dashboard/PageHeader";
import ChannelsView from "@/components/dashboard/channels/ChannelsView";
import { channels, channelsTakeaway } from "@/lib/mock/channels";

export const metadata: Metadata = { title: "Channels" };

export default function ChannelsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Performance by source"
        title="Channels"
        sub={channelsTakeaway}
        dateRange="13 May – 12 Jun 2026"
      />
      <ChannelsView channels={channels} />
    </>
  );
}
