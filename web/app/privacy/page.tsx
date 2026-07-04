import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import { PRIVACY_MD } from "@/lib/legal/documents";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How mrk18 collects, uses, and protects your data — DPDP Act compliant.",
};

// fully static — the Markdown is read + rendered at build, served as plain HTML
export const dynamic = "force-static";

export default function PrivacyPage() {
  return <LegalPage source={PRIVACY_MD} />;
}
