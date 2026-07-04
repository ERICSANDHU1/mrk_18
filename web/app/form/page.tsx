import type { Metadata } from "next";
import Background3D from "@/components/Background3D";
import WaitlistForm from "./WaitlistForm";

// A standalone, shareable one-page form — deliberately separate from the site
// (no nav, no footer, noindex). Share the /form link on LinkedIn, Instagram, etc.
export const metadata: Metadata = {
  title: { absolute: "Apply · Founding 500 — mrk18" },
  description:
    "Founder pricing locked for life. Once 500 founders are in, the door closes for good — claim your Founding 500 spot.",
  openGraph: {
    title: "Founding 500 — mrk18",
    description:
      "Founder pricing locked for life. Once 500 are in, the door closes for good. Claim your spot.",
    images: ["/og-form.png"],
  },
  robots: { index: false, follow: false },
};

export default function FormPage() {
  return (
    <main className="relative min-h-dvh w-full overflow-hidden">
      {/* same backdrop + revolving 3D shapes as the landing page */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-30 bg-[linear-gradient(105deg,#d3ccbb_0%,#dcd6c6_50%,#e5dfd1_100%)]"
      />
      <Background3D />
      <div className="theme-sand relative flex min-h-dvh items-center justify-center px-4 py-10">
        <WaitlistForm />
      </div>
    </main>
  );
}
