"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronsLeft, ChevronsRight, ChevronsUpDown, LayoutDashboard, PenTool } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { tenants } from "@/lib/mock/console";

const SECTIONS = [
  { href: "/console", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/cowork", label: "Cowork", icon: PenTool, exact: false },
];

/** Section-switcher rail — collapses to icons, expands to a labelled nav. */
export default function Rail({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const [tenant, setTenant] = useState(tenants[0]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <aside className="flex h-full w-full flex-col border-r border-line bg-[var(--sidebar)] py-3">
      {/* header — logo (+ wordmark) and collapse toggle */}
      <div className={`mb-4 flex items-center ${collapsed ? "flex-col gap-2.5" : "justify-between px-3"}`}>
        <Link href="/console" aria-label="MRK18 home" className="flex items-center gap-2.5">
          <Image src="/logo-light.svg" alt="mrk18 logo" width={30} height={23} priority className="shrink-0" />
          {!collapsed && <span className="text-[17px] font-extrabold tracking-tight text-ink">mrk18</span>}
        </Link>
        <button
          onClick={onToggle}
          title={`${collapsed ? "Expand" : "Collapse"} sidebar (Ctrl+B)`}
          aria-label="Toggle sidebar"
          className="grid h-7 w-7 place-items-center rounded-lg text-mute-2 transition-colors hover:bg-[var(--overlay-subtle)] hover:text-ink"
        >
          {collapsed ? <ChevronsRight size={16} aria-hidden /> : <ChevronsLeft size={16} aria-hidden />}
        </button>
      </div>

      {/* nav — Dashboard / Cowork at the top */}
      <nav className={`flex flex-1 flex-col gap-1 ${collapsed ? "items-center" : "px-2"}`}>
        {SECTIONS.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              aria-current={active ? "page" : undefined}
              className={`group relative flex items-center rounded-xl transition-colors duration-200 ${
                collapsed ? "h-10 w-10 justify-center" : "w-full gap-3 px-3 py-2.5"
              } ${active ? "bg-molten/10 text-molten" : "text-mute-2 hover:bg-surface hover:text-ink"}`}
            >
              {active && (
                <span aria-hidden className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-gradient-to-b from-molten to-ember" />
              )}
              <Icon size={18} strokeWidth={active ? 2.4 : 2} aria-hidden />
              {!collapsed && <span className="text-[13.5px] font-semibold">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* footer — tenant switcher + account */}
      <div className={`mt-2 flex flex-col gap-2 ${collapsed ? "items-center" : "px-2"}`}>
        <div ref={ref} className="relative w-full">
          <button
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={open}
            title={tenant.name}
            className={`flex items-center ${
              collapsed
                ? "flex-col gap-0.5"
                : "w-full gap-2.5 rounded-xl border border-line bg-surface px-2.5 py-2"
            }`}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-surface text-[13px] font-bold text-amber">
              {tenant.initial}
            </span>
            {!collapsed && (
              <span className="flex-1 truncate text-left text-[13px] font-semibold text-ink">{tenant.name}</span>
            )}
            <ChevronsUpDown size={collapsed ? 11 : 14} className="shrink-0 text-mute-2" aria-hidden />
          </button>
          <AnimatePresence>
            {open && (
              <motion.ul
                role="listbox"
                aria-label="Workspace"
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.16 }}
                className={`absolute z-50 overflow-hidden rounded-xl border border-line bg-surface-2 p-1.5 shadow-2xl ${
                  collapsed ? "bottom-0 left-full ml-2 w-56" : "bottom-full left-0 mb-2 w-full"
                }`}
              >
                <li className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-mute-2">
                  Workspace
                </li>
                {tenants.map((t) => (
                  <li key={t.id}>
                    <button
                      role="option"
                      aria-selected={t.id === tenant.id}
                      onClick={() => {
                        setTenant(t);
                        setOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors duration-150 hover:bg-[var(--overlay-subtle)]"
                    >
                      <span className="grid h-6 w-6 place-items-center rounded-md border border-line bg-surface text-[11px] font-bold text-amber">
                        {t.initial}
                      </span>
                      <span className="flex-1">{t.name}</span>
                      {t.id === tenant.id && <Check size={14} className="text-molten" aria-hidden />}
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
        <div className={collapsed ? "" : "px-1"}>
          <UserButton appearance={{ elements: { avatarBox: "h-8 w-8 rounded-xl border border-line" } }} />
        </div>
      </div>
    </aside>
  );
}
