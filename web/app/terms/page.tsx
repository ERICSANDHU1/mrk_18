import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import { TERMS_MD } from "@/lib/legal/documents";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms governing your use of mrk18 — the AI CMO, web app, and pocket device.",
};

// fully static — the Markdown is read + rendered at build, served as plain HTML
export const dynamic = "force-static";

export default function TermsPage() {
  return <LegalPage source={TERMS_MD} />;
}
