import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/sections/Footer";
import { LegalMarkdown, extractSections } from "./LegalMarkdown";

/** Shared shell for the Terms / Privacy pages — the site's Navbar + Footer, a
 *  sticky on-this-page nav, and the rendered document in a readable column. */
export default function LegalPage({ source }: { source: string }) {
  const sections = extractSections(source);

  const toc = (
    <nav className="flex flex-col gap-1.5">
      {sections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className="text-[12.5px] leading-snug text-muted transition-colors hover:text-molten"
        >
          {s.title}
        </a>
      ))}
    </nav>
  );

  return (
    <div className="theme-sand relative min-h-dvh text-ink">
      {/* greige backdrop, matching the landing */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(105deg,#d3ccbb_0%,#dcd6c6_50%,#e5dfd1_100%)]"
      />
      <Navbar subpage />

      <main className="mx-auto w-full max-w-6xl px-6 pb-24 pt-32">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} aria-hidden /> Back to home
        </Link>

        <div className="mt-8 grid gap-12 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* sticky TOC — desktop */}
          <aside className="hidden lg:block">
            <div className="sticky top-28">
              <p className="font-mono mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
                On this page
              </p>
              {toc}
            </div>
          </aside>

          <article className="min-w-0 max-w-[720px]">
            {/* collapsible TOC — mobile */}
            <details className="mb-8 rounded-xl border border-[rgba(27,24,21,0.14)] bg-white/50 px-4 py-3 lg:hidden">
              <summary className="cursor-pointer text-[13px] font-semibold text-ink">On this page</summary>
              <div className="mt-3">{toc}</div>
            </details>

            <LegalMarkdown source={source} />

            <p className="mt-14 border-t border-[rgba(27,24,21,0.14)] pt-6 text-[12.5px] leading-relaxed text-muted">
              Questions? Email{" "}
              <a href="mailto:mrk18ai@gmail.com" className="font-medium text-molten hover:underline">
                mrk18ai@gmail.com
              </a>
              . See also our{" "}
              <Link href="/terms" className="font-medium text-molten hover:underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="font-medium text-molten hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </article>
        </div>
      </main>

      <Footer />
    </div>
  );
}
