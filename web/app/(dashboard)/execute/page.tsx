import type { Metadata } from "next";
import PageHeader from "@/components/dashboard/PageHeader";
import ExecuteBoard from "@/components/dashboard/execute/ExecuteBoard";
import { executeItems } from "@/lib/mock/execute";

export const metadata: Metadata = { title: "Execute" };

export default function ExecutePage() {
  return (
    <>
      <PageHeader
        eyebrow="Advice → action"
        title="Execute"
        sub="Every move is tied to the metric it should shift. Your CMO re-checks the metric two weeks after a move lands."
      />
      <ExecuteBoard initial={executeItems} />
    </>
  );
}
