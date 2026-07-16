import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import { CONTACT_MD } from "@/lib/legal/documents";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact Sipnshow Private Limited about MRK18 — support, partnerships, privacy and data requests.",
};

// fully static — the Markdown is read + rendered at build, served as plain HTML
export const dynamic = "force-static";

export default function ContactPage() {
  return <LegalPage source={CONTACT_MD} />;
}
