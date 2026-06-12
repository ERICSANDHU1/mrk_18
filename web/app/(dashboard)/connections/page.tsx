import type { Metadata } from "next";
import PageHeader from "@/components/dashboard/PageHeader";
import ConnectionsGrid from "@/components/dashboard/connections/ConnectionsGrid";
import { connections } from "@/lib/mock/connections";

export const metadata: Metadata = { title: "Connections" };

export default function ConnectionsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Data sources"
        title="Connections"
        sub="Your CMO is only as honest as the data it can see. Connect everything once; verdicts sharpen within a day."
      />
      <ConnectionsGrid initial={connections} />
    </>
  );
}
