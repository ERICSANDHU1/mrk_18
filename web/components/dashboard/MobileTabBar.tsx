"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { MoreHorizontal, X } from "lucide-react";
import { MOBILE_PRIMARY, NAV_ITEMS } from "./nav";

/** Bottom tab bar + "More" sheet — the sidebar's mobile form. */
export default function MobileTabBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = NAV_ITEMS.filter((n) => MOBILE_PRIMARY.includes(n.href));
  const rest = NAV_ITEMS.filter((n) => !MOBILE_PRIMARY.includes(n.href));
  const restActive = rest.some((n) => n.href === pathname);

  return (
    <>
      <nav
        aria-label="Dashboard (mobile)"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-stroke-2 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        {primary.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors duration-200 ${
                active ? "text-amber" : "text-muted"
              }`}
            >
              <Icon size={18} strokeWidth={active ? 2.4 : 2} aria-hidden />
              {label === "Weekly Report" ? "Report" : label}
            </Link>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors duration-200 ${
            restActive ? "text-amber" : "text-muted"
          }`}
        >
          <MoreHorizontal size={18} aria-hidden />
          More
        </button>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="More navigation">
            <motion.button
              aria-label="Close menu"
              tabIndex={-1}
              className="absolute inset-0 h-full w-full bg-[var(--backdrop)] backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-stroke-2 bg-surface-2 p-4 pb-[max(env(safe-area-inset-bottom),16px)]"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">More</p>
                <button
                  onClick={() => setMoreOpen(false)}
                  aria-label="Close"
                  className="rounded-lg border border-stroke-2 p-1.5 text-muted"
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
              <ul className="grid grid-cols-2 gap-2">
                {rest.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href;
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={() => setMoreOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-2.5 rounded-xl border border-stroke-2 px-3 py-3 text-[13px] font-semibold ${
                          active ? "bg-[var(--overlay-subtle)] text-amber" : "bg-surface text-ink"
                        }`}
                      >
                        <Icon size={16} aria-hidden />
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
