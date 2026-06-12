"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NAV_ITEMS } from "./nav";

/** Collapsible left rail — desktop only; mobile gets the bottom tab bar. */
export default function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Dashboard"
      className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-stroke-2 bg-surface/60 transition-[width] duration-300 ease-out lg:flex ${
        collapsed ? "w-16" : "w-[248px]"
      }`}
    >
      <div className={`flex h-14 items-center border-b border-stroke-2 ${collapsed ? "justify-center px-2" : "justify-between px-4"}`}>
        <Link href="/dashboard" className="flex items-center gap-2" aria-label="mrk18 home">
          <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-molten via-amber to-ember text-[13px] font-extrabold text-black">
            m
          </span>
          {!collapsed && <span className="text-[15px] font-extrabold tracking-tight">mrk18</span>}
        </Link>
      </div>

      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3 dash-scroll">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <li key={href} className="relative">
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-gradient-to-b from-molten to-ember"
                />
              )}
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                title={collapsed ? label : undefined}
                className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors duration-200 ${
                  collapsed ? "justify-center" : ""
                } ${
                  active
                    ? "bg-white/[0.04] text-ink"
                    : "text-muted hover:bg-white/[0.03] hover:text-ink"
                }`}
              >
                <Icon
                  size={17}
                  strokeWidth={active ? 2.4 : 2}
                  aria-hidden
                  className={active ? "text-amber" : ""}
                />
                {!collapsed && <span className={active ? "text-gradient" : ""}>{label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-stroke-2 p-2">
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] text-muted transition-colors duration-200 hover:bg-white/[0.03] hover:text-ink ${
            collapsed ? "justify-center" : ""
          }`}
        >
          {collapsed ? <PanelLeftOpen size={17} aria-hidden /> : <PanelLeftClose size={17} aria-hidden />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </nav>
  );
}
