import type { Metadata } from "next";
import TasterExplore from "@/components/taster/TasterExplore";

export const metadata: Metadata = {
  title: "your idea — free CMO verdict",
  description:
    "No website yet? Describe your idea and get four honest CMO verdicts — USP, competition, positioning clarity, and launch voice. Free, no sign-up.",
};

/** Idea-mode taster — the hero hands the described idea over via
 *  sessionStorage (never the URL: an unlaunched idea shouldn't live in
 *  browser history or a shareable link). This static route wins over the
 *  dynamic /taster/[domain] sibling. */
export default function TasterIdeaPage() {
  return <TasterExplore mode="idea" />;
}
