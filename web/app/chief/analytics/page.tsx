import type { Metadata } from "next";
import CsvUpload from "@/components/app/chief/CsvUpload";

export const metadata: Metadata = { title: "Analytics interpreter" };

/** The analytics interpreter room — upload a Meta ads CSV, see it visualised,
 *  run the CMO diagnosis on an explicit click, then refine it in the pinned
 *  chat. CsvUpload owns the full-height layout (scroll body + pinned chat). */
export default function AnalyticsInterpreterPage() {
  return <CsvUpload />;
}
