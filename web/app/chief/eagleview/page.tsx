import type { Metadata } from "next";
import EagleViewClient from "@/components/app/chief/EagleViewClient";

export const metadata: Metadata = { title: "Eagle view" };

/** Eagle view — every measured post, ranked by engagement. */
export default function EagleViewPage() {
  return <EagleViewClient />;
}
