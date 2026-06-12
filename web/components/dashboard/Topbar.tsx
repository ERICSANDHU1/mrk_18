"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Check, ChevronDown, FileText, Search } from "lucide-react";

const WORKSPACES = ["Arc Invoicing", "mrk18 demo"];

const NOTIFICATIONS = [
  { id: "n1", tone: "bad", text: "Google Ads waste crossed ₹40k this month.", time: "2 h ago" },
  { id: "n2", tone: "brand", text: "Your weekly bitter-truth report is ready.", time: "this morning" },
  { id: "n3", tone: "good", text: "Stripe synced — customer counts verified.", time: "44 min ago" },
] as const;

function useDismiss(open: boolean, onClose: () => void, ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, onClose, ref]);
}

function Pop({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.98 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="absolute right-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-xl border border-stroke-2 bg-surface-2 shadow-2xl"
    >
      {children}
    </motion.div>
  );
}

/** Slim top bar: workspace · search · notifications · report bell · avatar. */
export default function Topbar() {
  const [wsOpen, setWsOpen] = useState(false);
  const [workspace, setWorkspace] = useState(WORKSPACES[0]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [meOpen, setMeOpen] = useState(false);
  const wsRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const meRef = useRef<HTMLDivElement>(null);
  useDismiss(wsOpen, () => setWsOpen(false), wsRef);
  useDismiss(notifOpen, () => setNotifOpen(false), notifRef);
  useDismiss(meOpen, () => setMeOpen(false), meRef);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-stroke-2 bg-bg/85 px-4 backdrop-blur-md sm:px-6">
      {/* workspace switcher */}
      <div ref={wsRef} className="relative">
        <button
          onClick={() => setWsOpen((v) => !v)}
          aria-expanded={wsOpen}
          aria-haspopup="listbox"
          className="flex items-center gap-2 rounded-lg border border-stroke-2 bg-surface px-2.5 py-1.5 text-[13px] font-semibold transition-colors duration-200 hover:bg-surface-2"
        >
          <span aria-hidden className="h-2 w-2 rounded-full bg-good pulse-dot" />
          <span className="max-w-32 truncate">{workspace}</span>
          <ChevronDown size={14} className="text-muted" aria-hidden />
        </button>
        <AnimatePresence>
          {wsOpen && (
            <Pop>
              <ul role="listbox" aria-label="Workspace" className="p-1.5">
                {WORKSPACES.map((w) => (
                  <li key={w}>
                    <button
                      role="option"
                      aria-selected={w === workspace}
                      onClick={() => {
                        setWorkspace(w);
                        setWsOpen(false);
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors duration-150 hover:bg-white/5"
                    >
                      {w}
                      {w === workspace && <Check size={14} className="text-amber" aria-hidden />}
                    </button>
                  </li>
                ))}
              </ul>
            </Pop>
          )}
        </AnimatePresence>
      </div>

      {/* search */}
      <label className="relative hidden min-w-0 flex-1 max-w-md items-center md:flex">
        <span className="sr-only">Search metrics, channels, moves</span>
        <Search size={14} className="pointer-events-none absolute left-3 text-muted" aria-hidden />
        <input
          type="search"
          placeholder="Search metrics, channels, moves…"
          className="h-9 w-full rounded-lg border border-stroke-2 bg-surface pl-9 pr-12 text-[13px] text-ink placeholder:text-muted/70 focus:border-amber/40 focus:outline-none"
        />
        <kbd
          aria-hidden
          className="absolute right-3 rounded border border-stroke-2 bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted"
        >
          ⌘K
        </kbd>
      </label>

      <div className="ml-auto flex items-center gap-1.5">
        {/* notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setNotifOpen((v) => !v)}
            aria-expanded={notifOpen}
            aria-label="Notifications (3)"
            className="relative rounded-lg p-2 text-muted transition-colors duration-200 hover:bg-white/5 hover:text-ink"
          >
            <Bell size={17} aria-hidden />
            <span aria-hidden className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-bad" />
          </button>
          <AnimatePresence>
            {notifOpen && (
              <Pop>
                <p className="border-b border-stroke-2 px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Notifications
                </p>
                <ul>
                  {NOTIFICATIONS.map((n) => (
                    <li key={n.id} className="flex gap-2.5 border-b border-stroke-2 px-3.5 py-3 last:border-0">
                      <span
                        aria-hidden
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                          n.tone === "bad" ? "bg-bad" : n.tone === "good" ? "bg-good" : "bg-amber"
                        }`}
                      />
                      <div>
                        <p className="text-[13px] leading-snug">{n.text}</p>
                        <p className="mt-0.5 text-[11px] text-muted">{n.time}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Pop>
            )}
          </AnimatePresence>
        </div>

        {/* weekly report bell */}
        <Link
          href="/report"
          aria-label="Weekly report ready"
          title="Weekly report"
          className="relative rounded-lg p-2 text-muted transition-colors duration-200 hover:bg-white/5 hover:text-ink"
        >
          <FileText size={17} aria-hidden />
          <span aria-hidden className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber pulse-dot" />
        </Link>

        {/* avatar */}
        <div ref={meRef} className="relative">
          <button
            onClick={() => setMeOpen((v) => !v)}
            aria-expanded={meOpen}
            aria-label="Account menu"
            className="grid h-8 w-8 place-items-center rounded-full border border-stroke-2 bg-surface-2 text-[11px] font-bold text-amber transition-colors duration-200 hover:border-amber/40"
          >
            AR
          </button>
          <AnimatePresence>
            {meOpen && (
              <Pop>
                <div className="border-b border-stroke-2 px-3.5 py-3">
                  <p className="text-[13px] font-semibold">Arc Invoicing</p>
                  <p className="text-[11px] text-muted">founder@arcinvoicing.in</p>
                </div>
                <ul className="p-1.5">
                  <li>
                    <Link
                      href="/settings"
                      onClick={() => setMeOpen(false)}
                      className="block rounded-lg px-2.5 py-2 text-[13px] transition-colors duration-150 hover:bg-white/5"
                    >
                      Settings
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/connections"
                      onClick={() => setMeOpen(false)}
                      className="block rounded-lg px-2.5 py-2 text-[13px] transition-colors duration-150 hover:bg-white/5"
                    >
                      Connections
                    </Link>
                  </li>
                  <li>
                    <button className="block w-full rounded-lg px-2.5 py-2 text-left text-[13px] text-muted transition-colors duration-150 hover:bg-white/5 hover:text-ink">
                      Sign out
                    </button>
                  </li>
                </ul>
              </Pop>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
