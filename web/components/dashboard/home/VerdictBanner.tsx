"use client";

import { motion } from "framer-motion";
import { CalendarDays, Sparkles } from "lucide-react";
import type { WeekVerdict } from "@/lib/mock/types";

const CONFIDENCE: Record<WeekVerdict["confidence"], string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

/** The most important element on the screen — your CMO calling, in text. */
export default function VerdictBanner({ verdict }: { verdict: WeekVerdict }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      aria-label="This week's verdict"
      className="relative overflow-hidden rounded-2xl border border-stroke-2 bg-surface p-6 sm:p-7"
    >
      {/* single restrained brand accent: hairline gradient along the top edge */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-molten via-amber to-transparent"
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
          <Sparkles size={12} className="text-amber" aria-hidden />
          This week&apos;s verdict
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-stroke-2 bg-surface-2 px-2.5 py-0.5 text-[11px] font-semibold text-ink">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-good" />
          {CONFIDENCE[verdict.confidence]}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
          <CalendarDays size={12} aria-hidden />
          {verdict.dateRange}
        </span>
      </div>
      <h1 className="mt-3 max-w-3xl text-2xl font-extrabold leading-snug tracking-tight sm:text-[28px]">
        {verdict.headline}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{verdict.sub}</p>
    </motion.section>
  );
}
