"use client";

import { useEffect, useRef, useState } from "react";

const FOUNDERS = [
  { name: "Pritam Raj", href: "https://www.linkedin.com/in/pritam-raj-63341423b/" },
  { name: "Eric Sandhu", href: "https://www.linkedin.com/in/eric-sandhu-277b85307/" },
];

function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" className={className} aria-hidden>
      <path d="M19 0h-14c-2.76 0-5 2.24-5 5v14c0 2.76 2.24 5 5 5h14c2.76 0 5-2.24 5-5v-14c0-2.76-2.24-5-5-5zM8 19h-3v-9h3v9zm-1.5-10.27c-.97 0-1.75-.79-1.75-1.76s.78-1.76 1.75-1.76 1.75.79 1.75 1.76-.78 1.76-1.75 1.76zm13.5 10.27h-3v-4.6c0-2.74-3-2.51-3 0v4.6h-3v-9h3v1.2c1.4-2.59 6-2.78 6 2.48v5.32z" />
    </svg>
  );
}

/** "Talk to the founders" → a small popover linking out to each founder's
 *  LinkedIn (opens in a new tab). */
export default function FoundersPopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="text-[14px] font-semibold text-ink underline-offset-4 transition-colors hover:text-amber hover:underline"
      >
        Talk to the founders
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-30 mb-2 w-60 overflow-hidden rounded-2xl border border-stroke bg-surface p-1.5 shadow-[0_18px_50px_rgba(180,83,42,0.16)]">
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Reach out on LinkedIn
          </p>
          {FOUNDERS.map((f) => (
            <a
              key={f.href}
              href={f.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] font-semibold text-ink transition-colors hover:bg-[#1b1815]/[0.05]"
            >
              <LinkedinIcon className="shrink-0 text-amber" />
              {f.name}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
