import type { Metadata } from "next";
import ContentLibraryClient from "@/components/app/chief/ContentLibraryClient";

export const metadata: Metadata = { title: "Content & scripts" };

/** The content library — every post and script the CMO has produced. */
export default function ContentLibraryPage() {
  return <ContentLibraryClient />;
}
