import type { Metadata } from "next";
import PageHeader from "@/components/dashboard/PageHeader";
import LeaksTable from "@/components/dashboard/leaks/LeaksTable";
import { leakRows, leaksTakeaway } from "@/lib/mock/leaks";

export const metadata: Metadata = { title: "Leaks" };

export default function LeaksPage() {
  return (
    <>
      <PageHeader
        eyebrow="Watchdog"
        title="Where money is draining"
        sub={leaksTakeaway}
        dateRange="13 May – 12 Jun 2026"
      />
      <LeaksTable rows={leakRows} />
    </>
  );
}
