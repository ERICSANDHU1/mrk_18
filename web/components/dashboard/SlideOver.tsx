"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

/** Right-side drill-down panel — evidence one click away, never on the default view. */
export default function SlideOver({
  open,
  onClose,
  title,
  eyebrow,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
          <motion.button
            aria-label="Close panel"
            tabIndex={-1}
            className="absolute inset-0 h-full w-full bg-black/60 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.aside
            className="dash-scroll absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col overflow-y-auto border-l border-stroke-2 bg-surface-2 shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-stroke-2 bg-surface-2/95 p-5 backdrop-blur">
              <div>
                {eyebrow && (
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                    {eyebrow}
                  </p>
                )}
                <h2 className="mt-0.5 text-lg font-bold tracking-tight">{title}</h2>
              </div>
              <button
                ref={closeRef}
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg border border-stroke-2 p-1.5 text-muted transition-colors duration-200 hover:bg-white/5 hover:text-ink"
              >
                <X size={16} aria-hidden />
              </button>
            </header>
            <div className="flex-1 p-5">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
