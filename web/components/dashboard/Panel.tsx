"use client";

import { motion } from "framer-motion";

/** Standard dashboard panel: solid surface, hairline border, staggered fade-up. */
export default function Panel({
  children,
  eyebrow,
  title,
  action,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  eyebrow?: string;
  title?: string;
  action?: React.ReactNode;
  /** stagger index — multiplied by 70ms */
  delay?: number;
  className?: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: delay * 0.07 }}
      className={`rounded-2xl border border-stroke-2 bg-surface p-5 ${className}`}
    >
      {(eyebrow || title || action) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {eyebrow && (
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                {eyebrow}
              </p>
            )}
            {title && (
              <h2 className="mt-0.5 text-[15px] font-bold tracking-tight">{title}</h2>
            )}
          </div>
          {action}
        </header>
      )}
      {children}
    </motion.section>
  );
}
