"use client";

import Link from "next/link";
import { Eye, ArrowRight } from "lucide-react";

/** The slim strip shown across the top of Comrk / Chief when a non-member is
 *  exploring the demo. Says plainly it's sample data, and points to /pricing. */
export default function DemoBanner({ section }: { section: "Comrk" | "Chief" }) {
  return (
    <div className="shrink-0 border-b border-molten/25 bg-molten/[0.06] px-5 py-2.5">
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[12.5px] text-ink">
          <Eye size={14} className="shrink-0 text-molten" aria-hidden />
          <span>
            You&apos;re exploring a live demo of <span className="font-semibold">{section}</span> —
            this is sample data. Unlock to run it on your real numbers.
          </span>
        </p>
        <Link
          href="/pricing"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold text-[color:var(--cta-ink,#0a0a0b)]"
          style={{ background: "var(--gradient-brand)" }}
        >
          Unlock <ArrowRight size={13} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
