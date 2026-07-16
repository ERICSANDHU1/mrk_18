"use client";

import { Suspense, useEffect, useState } from "react";
import Logo from "@/components/app/Logo";
import Wordmark from "@/components/app/Wordmark";
import ChatRecents from "@/components/app/ChatRecents";
import CoworkRecents from "@/components/app/CoworkRecents";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsLeft,
  ChevronsRight,
  Crown,
  Droplet,
  Eye,
  Files,
  FileSpreadsheet,
  Filter,
  LayoutDashboard,
  Lock,
  type LucideIcon,
  MessageSquare,
  Plug,
  Plus,
  Radar,
  Settings,
  Users,
} from "lucide-react";
import { UserButton, useUser } from "@clerk/nextjs";
import { hasProAccess } from "@/lib/entitlements";
import ThemeToggle from "./ThemeToggle";

type NavItem = { href: string; label: string; icon: LucideIcon; exact: boolean; badge?: string; locked?: boolean };

// One 3-tab segment — Chat · Comrk · Chief — like Claude Code. Dashboard pinned bottom.
// Comrk + Chief are Founding 500 only: signup unlocks Chat; clicking a locked tab
// opens the upgrade modal (Ask 2) instead of navigating.
const TOP: NavItem[] = [
  { href: "/chat", label: "Chat", icon: MessageSquare, exact: false },
  { href: "/cowork", label: "Comrk", icon: Users, exact: false, locked: true },
  { href: "/chief", label: "Chief", icon: Crown, exact: false, locked: true },
];

const openUpgrade = (feature: string) =>
  window.dispatchEvent(new CustomEvent("mrk18:open-upgrade", { detail: { feature } }));
const BOTTOM: NavItem = { href: "/console", label: "Dashboard", icon: LayoutDashboard, exact: true };

// Chief's rooms — the command-center areas, one page each (shown in the sidebar
// when the Chief tab is active; the Chief page itself is the visual overview).
// `desc` feeds the hover hint so a founder never has to guess what a room is.
const CHIEF_NAV: (NavItem & { soon?: boolean; desc: string })[] = [
  {
    href: "/console/leaks",
    label: "Leaks",
    icon: Droplet,
    exact: false,
    desc: "Where your money quietly bleeds — the spends bringing nothing back.",
  },
  {
    href: "/chief/eagleview",
    label: "Eagle view",
    icon: Eye,
    exact: false,
    desc: "Every published post tracked — reach, engagement, and what it taught the brain.",
  },
  {
    href: "/console/channels",
    label: "Channels & connectors",
    icon: Plug,
    exact: false,
    desc: "Plug in Meta, LinkedIn and X — see what's connected and what it feeds.",
  },
  {
    href: "/chief/content",
    label: "Content & scripts",
    icon: Files,
    exact: false,
    desc: "Everything your CMO has written for you — posts, threads and reel scripts.",
  },
  {
    href: "/console/funnel",
    label: "Funnel",
    icon: Filter,
    exact: false,
    desc: "Visitors → signups → paying: where people drop off, stage by stage.",
  },
  {
    href: "/chief/watchdog",
    label: "Watchdog",
    icon: Radar,
    exact: false,
    soon: true,
    desc: "Always-on alerts when spend spikes or performance dives. Coming soon.",
  },
];

/** Flyout hint to the right of a sidebar row — appears on hover or keyboard
 *  focus, after a short delay so quick mouse passes stay quiet. */
function HoverHint({ text }: { text: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 w-56 -translate-y-1/2 rounded-xl border border-line bg-surface px-3 py-2 text-[11.5px] font-medium leading-relaxed text-ink opacity-0 shadow-lg shadow-[var(--shadow-color)] transition-opacity duration-150 group-hover:opacity-100 group-hover:delay-300 group-focus-visible:opacity-100"
    >
      {text}
    </span>
  );
}

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

  // Founding 500 gate — allowlisted accounts (the founder, hand-onboarded
  // members) see Comrk + Chief unlocked; everyone else gets the upgrade modal.
  const pro = hasProAccess(user?.primaryEmailAddress?.emailAddress);
  const topItems: NavItem[] = TOP.map((t) => ({ ...t, locked: t.locked && !pro }));

  // Which of the 3 tabs is active. /mrk lives under Comrk; Chief owns its rooms
  // (including the console detail pages it links to).
  const activeTab =
    pathname.startsWith("/chief") ||
    ["/console/leaks", "/console/channels", "/console/funnel"].some((p) => pathname.startsWith(p))
      ? "/chief"
      : pathname.startsWith("/cowork") || pathname.startsWith("/mrk")
        ? "/cowork"
        : "/chat";

  const renderRow = (item: NavItem) => {
    const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
    const Icon = item.icon;
    if (item.locked) {
      // Founding 500 gate — opens the upgrade modal instead of navigating
      return (
        <button
          key={item.href}
          type="button"
          onClick={() => openUpgrade(item.label)}
          title={`${item.label} — Founding 500 only`}
          className={`group relative flex items-center rounded-xl text-mute-2 opacity-70 transition-colors duration-200 hover:bg-surface hover:text-ink ${
            collapsed ? "h-10 w-10 justify-center" : "w-full gap-3 px-3 py-2.5"
          }`}
        >
          <Icon size={18} strokeWidth={2} aria-hidden />
          {!collapsed && <span className="flex-1 text-left text-[13.5px] font-semibold">{item.label}</span>}
          <Lock
            size={collapsed ? 9 : 13}
            aria-hidden
            className={collapsed ? "absolute right-1 top-1 text-molten" : "text-molten"}
          />
          {!collapsed && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-mute-2">
              Founding 500
            </span>
          )}
        </button>
      );
    }
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
          <Logo size={26} className="shrink-0" />
          {!collapsed && <Wordmark className="text-[17px] font-extrabold tracking-tight text-ink" />}
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

      {/* nav — the 3-tab segment (Chat / Comrk / Chief) + the active tab's list, Dashboard pinned bottom */}
      <nav className={`flex min-h-0 flex-1 flex-col ${collapsed ? "items-center gap-1" : "px-2"}`}>
        {collapsed ? (
          /* collapsed — icon-only nav */
          <>
            <div aria-hidden className="my-1.5 w-6 self-center border-t border-line" />
            {topItems.map(renderRow)}
            <div className="flex-1" />
            <div aria-hidden className="my-1.5 w-6 self-center border-t border-line" />
            {renderRow(BOTTOM)}
          </>
        ) : (
          /* expanded — Chat / Comrk / Chief segment (all three labelled) + the active tab's session list */
          <>
            <div className="mt-1 flex gap-1 rounded-xl border border-line bg-surface-2 p-1">
              {topItems.map((t) => {
                const on = activeTab === t.href;
                const Icon = t.icon;
                const cls = `flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12px] font-semibold transition-colors ${
                  on ? "bg-surface text-ink shadow-sm" : "text-mute-2 hover:bg-surface/50 hover:text-ink"
                }`;
                if (t.locked) {
                  return (
                    <button
                      key={t.href}
                      type="button"
                      onClick={() => openUpgrade(t.label)}
                      title={`${t.label} — Founding 500 only`}
                      className={`${cls} opacity-70`}
                    >
                      <Lock size={12} className="text-molten" aria-hidden />
                      {t.label}
                    </button>
                  );
                }
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    title={t.label}
                    aria-current={on ? "page" : undefined}
                    className={cls}
                  >
                    <Icon size={14} aria-hidden />
                    {t.label}
                  </Link>
                );
              })}
            </div>

            {activeTab === "/chief" ? (
              /* Chief's rooms — overview on the tab itself, one page per room */
              <>
                {/* featured — the analytics interpreter, always one click away */}
                <Link
                  href="/chief/analytics"
                  aria-current={pathname.startsWith("/chief/analytics") ? "page" : undefined}
                  className={`group relative mt-3 flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors duration-200 ${
                    pathname.startsWith("/chief/analytics")
                      ? "border-molten/40 bg-molten/[0.08]"
                      : "border-line bg-surface hover:border-molten/40"
                  }`}
                >
                  <HoverHint text="Upload your Meta ads export, see the numbers instantly, and get the CMO's diagnosis — it runs only when you click." />
                  <FileSpreadsheet size={16} className="shrink-0 text-molten" aria-hidden />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-[12.5px] font-bold text-ink">Analytics interpreter</span>
                    <span className="block truncate text-[10.5px] text-mute-2">
                      Upload Meta CSV → diagnosis
                    </span>
                  </span>
                </Link>

                <p className="font-data mt-4 px-1 text-[10px] uppercase tracking-[0.18em] text-mute-2">
                  Command center
                </p>
                <div className="mt-1.5 space-y-0.5">
                  {CHIEF_NAV.map((item) => {
                    const active = pathname.startsWith(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`group relative flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors duration-200 ${
                          active ? "bg-molten/10 text-molten" : "text-mute-2 hover:bg-surface hover:text-ink"
                        }`}
                      >
                        <HoverHint text={item.desc} />
                        <Icon size={15} aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
                          {item.label}
                        </span>
                        {item.soon && (
                          <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-mute-2">
                            Soon
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
                <div className="flex-1" />
              </>
            ) : (
              <>
                <Link
                  // /chat?new=1 is a real URL change from any state — ChatClient
                  // resets on it; the event covers the instant already-on-/chat case
                  href={activeTab === "/chat" ? "/chat?new=1" : activeTab}
                  onClick={
                    activeTab === "/chat"
                      ? () => window.dispatchEvent(new Event("mrk18:new-chat"))
                      : undefined
                  }
                  className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-[13px] font-semibold text-ink transition-colors hover:border-molten/40"
                >
                  <Plus size={15} className="text-molten" aria-hidden />
                  New {activeTab === "/cowork" ? "run" : "chat"}
                </Link>

                {activeTab === "/cowork" && (
                  <Link
                    href="/mrk"
                    aria-current={pathname.startsWith("/mrk") ? "page" : undefined}
                    className={`mt-2 flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors duration-200 ${
                      pathname.startsWith("/mrk")
                        ? "border-molten/40 bg-molten/[0.08]"
                        : "border-line bg-surface hover:border-molten/40"
                    }`}
                  >
                    <Radar size={16} className="shrink-0 text-molten" aria-hidden />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block text-[12.5px] font-bold text-ink">mrk</span>
                      <span className="block truncate text-[10.5px] text-mute-2">CMO in your pocket</span>
                    </span>
                    <span className="rounded-full bg-molten/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-molten">
                      Soon
                    </span>
                  </Link>
                )}

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
              </>
            )}

            <div aria-hidden className="mx-1 my-2 border-t border-line" />
            {renderRow(BOTTOM)}
          </>
        )}
      </nav>

      {/* footer — appearance toggle and the workspace block (Settings lives in the
          user popover below, next to Manage account / Sign out) */}
      <div className={`mt-2 ${collapsed ? "flex flex-col items-center gap-2" : "space-y-2 px-2"}`}>
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
          <UserButton appearance={{ elements: { avatarBox: "h-9 w-9 rounded-xl border border-line" } }}>
            {/* Settings merged into the account popover, above the two Clerk defaults */}
            <UserButton.MenuItems>
              <UserButton.Link
                label="Settings"
                labelIcon={<Settings size={15} aria-hidden />}
                href="/console/settings"
              />
              <UserButton.Action label="manageAccount" />
              <UserButton.Action label="signOut" />
            </UserButton.MenuItems>
          </UserButton>
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
