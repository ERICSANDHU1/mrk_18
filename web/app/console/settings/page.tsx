import type { Metadata } from "next";
import DashboardFrame from "@/components/app/dashboard/DashboardFrame";
import PageHeader from "@/components/dashboard/PageHeader";
import SettingsView from "@/components/dashboard/settings/SettingsView";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <DashboardFrame>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        sub="Tune how your CMO talks, when it interrupts, and what it watches."
      />
      <SettingsView />
    </DashboardFrame>
  );
}
