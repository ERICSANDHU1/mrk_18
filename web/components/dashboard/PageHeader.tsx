"use client";

import { motion } from "framer-motion";
import { CalendarDays } from "lucide-react";

/** Consistent page intro: eyebrow, decision-first title, optional date range + actions. */
export default function PageHeader({
  eyebrow,
  title,
  sub,
  dateRange,
  actions,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  dateRange?: string;
  actions?: React.ReactNode;
}) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="mb-5 flex flex-wrap items-end justify-between gap-3"
    >
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">{eyebrow}</p>
        <h1 className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h1>
        {sub && <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">{sub}</p>}
      </div>
      <div className="flex items-center gap-2.5">
        {dateRange && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-stroke-2 bg-surface px-2.5 py-1.5 text-[12px] text-muted">
            <CalendarDays size={13} aria-hidden />
            {dateRange}
          </span>
        )}
        {actions}
      </div>
    </motion.header>
  );
}
