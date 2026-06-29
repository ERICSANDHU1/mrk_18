"use client";

import { Suspense, useEffect, useState } from "react";
import Logo from "@/components/app/Logo";
import ChatRecents from "@/components/app/ChatRecents";
import CoworkRecents from "@/components/app/CoworkRecents";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsLeft,
  ChevronsRight,
  Crown,
  LayoutDashboard,
  type LucideIcon,
  MessageSquare,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import { UserButton, useUser } from "@clerk/nextjs";
import ThemeToggle from "./ThemeToggle";

type NavItem = { href: string; label: string; icon: LucideIcon; exact: boolean; badge?: string };

// CHIEF sits at the top with its own elevated treatment; Chat + Comrk beneath it,
// and Dashboard pinned to the bottom of the rail.
const TOP: NavItem[] = [
  { href: "/chat", label: "Chat", icon: MessageSquare, exact: false },
  { href: "/cowork", label: "Comrk", icon: Users, exact: false },
];
const BOTTOM: NavItem = { href: "/console", label: "Dashboard", icon: LayoutDashboard, exact: true };

// Each tab's Recents are fetched live, per founder: Chat → /api/chats (ChatRecents),
// Comrk → /api/runs (CoworkRecents). No more shared placeholder rows.
type Workspace = { name: string; initial: string };

/** Section-switcher rail — collapses to icons, expands to a labelled nav. */
export default function Rail({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  // Real workspace identity = the founder's own company (from their profile).
  // No multi-tenant switching exists yet, so this is a label, not a dropdown.
  useEffect(() => {
    let active = true;
    fetch("/api/me/profile", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active || !d) return;
        const name: string =
          d?.profile?.company_name ||
          (typeof d?.email === "string" ? d.email.split("@")[0] : "") ||
          "Your workspace";
        setWorkspace({ name, initial: (name.trim()[0] || "·").toUpperCase() });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const { user } = useUser();
  const userLabel =
    user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? user?.username ?? "";

  // Which tab's list is showing. Comrk when on a cowork route, Chat otherwise.
  const activeTab = pathname.startsWith("/cowork") ? "/cowork" : "/chat";

  const renderRow = (item: NavItem) => {
    const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        title={item.label}
        aria-current={active ? "page" : undefined}
        className={`group relative flex items-center rounded-xl transition-colors duration-200 ${
          collapsed ? "h-10 w-10 justify-center" : "w-full gap-3 px-3 py-2.5"
        } ${active ? "bg-molten/10 text-molten" : "text-mute-2 hover:bg-surface hover:text-ink"}`}
      >
        {active && (
          <span aria-hidden className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-gradient-to-b from-molten to-ember" />
        )}
        <Icon size={18} strokeWidth={active ? 2.4 : 2} aria-hidden />
        {!collapsed && <span className="flex-1 text-[13.5px] font-semibold">{item.label}</span>}
        {!collapsed && item.badge && (
          <span className="rounded-full border border-amber/30 bg-amber/10 px-2 py-0.5 text-[11px] font-bold text-amber">
            {item.badge}
          </span>
        )}
        {collapsed && item.badge && (
          <span aria-hidden className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber" />
        )}
      </Link>
    );
  };

  return (
    <aside className="flex h-full w-full flex-col border-r border-line bg-[var(--sidebar)] py-3">
      {/* header — logo (+ wordmark) and collapse toggle */}
      <div className={`mb-4 flex items-center ${collapsed ? "flex-col gap-2.5" : "justify-between px-3"}`}>
        <Link href="/console" aria-label="MRK18 home" className="flex items-center gap-2.5">
          <Logo width={30} height={23} className="shrink-0" />
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

      {/* nav — CHIEF header, then the active tab's list (Chat / Comrk), Dashboard pinned bottom */}
      <nav className={`flex min-h-0 flex-1 flex-col ${collapsed ? "items-center gap-1" : "px-2"}`}>
        {/* CHIEF — elevated command-center entry */}
        <Link
          href="/chief"
          title="CHIEF"
          aria-current={pathname.startsWith("/chief") ? "page" : undefined}
          className={`group relative rounded-xl border transition-colors duration-200 ${
            collapsed ? "grid h-11 w-11 place-items-center" : "block px-3.5 py-3"
          } ${
            pathname.startsWith("/chief")
              ? "border-molten/40 bg-molten/[0.08]"
              : "border-line bg-surface hover:border-molten/40"
          }`}
        >
          {!collapsed && (
            <span aria-hidden className="absolute inset-x-3.5 top-0 h-[2.5px] rounded-full bg-gradient-to-r from-molten to-ember" />
          )}
          {collapsed ? (
            <Crown size={18} className="text-molten" aria-hidden />
          ) : (
            <span className="flex items-center gap-2.5">
              <Crown size={17} className="text-molten" aria-hidden />
              <span className="text-[16px] font-extrabold tracking-wide text-ink">CHIEF</span>
            </span>
          )}
        </Link>

        {collapsed ? (
          /* collapsed — icon-only nav */
          <>
            <div aria-hidden className="my-1.5 w-6 self-center border-t border-line" />
            {TOP.map(renderRow)}
            <div className="flex-1" />
            <div aria-hidden className="my-1.5 w-6 self-center border-t border-line" />
            {renderRow(BOTTOM)}
          </>
        ) : (
          /* expanded — Chat / Comrk tabs + the active tab's session list */
          <>
            <div className="mt-3 flex gap-1 rounded-xl border border-line bg-surface p-1">
              {TOP.map((t) => {
                const on = activeTab === t.href;
                const Icon = t.icon;
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    aria-current={on ? "page" : undefined}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12.5px] font-semibold transition-colors ${
                      on ? "bg-molten/10 text-molten" : "text-mute-2 hover:text-ink"
                    }`}
                  >
                    <Icon size={15} aria-hidden />
                    {t.label}
                    {t.badge && (
                      <span className="ml-0.5 rounded-full bg-amber/15 px-1.5 text-[10px] font-bold text-amber">
                        {t.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>

            <Link
              href={activeTab}
              className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-[13px] font-semibold text-ink transition-colors hover:border-molten/40"
            >
              <Plus size={15} className="text-molten" aria-hidden />
              New {activeTab === "/cowork" ? "run" : "chat"}
            </Link>

            <p className="font-data mt-4 px-1 text-[10px] uppercase tracking-[0.18em] text-mute-2">Recents</p>
            <div className="dash-scroll mt-1.5 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-0.5">
              {activeTab === "/cowork" ? (
                <CoworkRecents />
              ) : (
                <Suspense fallback={null}>
                  <ChatRecents />
                </Suspense>
              )}
            </div>

            <div aria-hidden className="mx-1 my-2 border-t border-line" />
            {renderRow(BOTTOM)}
          </>
        )}
      </nav>

      {/* footer — settings, appearance toggle, and the workspace block */}
      <div className={`mt-2 ${collapsed ? "flex flex-col items-center gap-2" : "space-y-2 px-2"}`}>
        <Link
          href="/console/settings"
          title="Settings"
          aria-current={pathname.startsWith("/console/settings") ? "page" : undefined}
          className={`group flex items-center rounded-xl transition-colors duration-200 ${
            collapsed ? "h-10 w-10 justify-center" : "w-full gap-3 px-3 py-2.5"
          } ${
            pathname.startsWith("/console/settings")
              ? "bg-molten/10 text-molten"
              : "text-mute-2 hover:bg-surface hover:text-ink"
          }`}
        >
          <Settings size={18} aria-hidden />
          {!collapsed && <span className="text-[13.5px] font-semibold">Settings</span>}
        </Link>
        {!collapsed && (
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-[11px] font-medium text-mute-2">Appearance</span>
            <ThemeToggle />
          </div>
        )}
        <div
          title={`${workspace?.name ?? "Your workspace"}${userLabel ? ` · ${userLabel}` : ""}`}
          className={`flex items-center ${
            collapsed ? "" : "w-full gap-2.5 rounded-xl border border-line bg-surface px-2 py-1.5"
          }`}
        >
          <UserButton appearance={{ elements: { avatarBox: "h-9 w-9 rounded-xl border border-line" } }} />
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-semibold text-ink">
                {workspace?.name ?? "Your workspace"}
              </p>
              {userLabel && <p className="truncate text-[11px] text-mute-2">{userLabel}</p>}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
