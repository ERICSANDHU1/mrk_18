import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import PageHeader from "@/components/dashboard/PageHeader";
import FunnelView from "@/components/dashboard/funnel/FunnelView";
import { funnelStages, funnelTakeaway } from "@/lib/mock/funnel";
import { connections } from "@/lib/mock/connections";

export const metadata: Metadata = { title: "Funnel" };

export default function FunnelPage() {
  const ga4 = connections.find((c) => c.id === "cn-ga4");
  const partiallyBlind = ga4 ? !ga4.connected : false;

  return (
    <>
      <PageHeader
        eyebrow="Where customers go missing"
        title="Funnel"
        sub={funnelTakeaway}
        dateRange="13 May – 12 Jun 2026"
      />
      {partiallyBlind && (
        <p className="mb-5 flex items-start gap-2.5 rounded-xl border border-watch/25 bg-watch/[0.06] px-4 py-3 text-[13px] leading-relaxed">
          <TriangleAlert size={15} className="mt-0.5 shrink-0 text-watch" aria-hidden />
          <span>
            GA4 isn&apos;t connected, so this funnel is stitched from UTM and Stripe joins — good
            enough to act on, but stage verdicts stay capped at medium confidence.{" "}
            <Link href="/connections" className="font-bold text-amber transition-opacity duration-200 hover:opacity-80">
              Connect GA4
            </Link>
          </span>
        </p>
      )}
      <FunnelView stages={funnelStages} />
    </>
  );
}
