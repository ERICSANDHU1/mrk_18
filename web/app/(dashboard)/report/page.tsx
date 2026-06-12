import type { Metadata } from "next";
import PageHeader from "@/components/dashboard/PageHeader";
import ReportView from "@/components/dashboard/report/ReportView";
import { weeklyReports } from "@/lib/mock/report";

export const metadata: Metadata = { title: "Weekly Report" };

export default function ReportPage() {
  return (
    <>
      <PageHeader
        eyebrow="The bitter truth, weekly"
        title="Weekly Report"
        sub="What worked, what's leaking money, and what to do next — in plain language, with the proof attached."
      />
      <ReportView reports={weeklyReports} />
    </>
  );
}
