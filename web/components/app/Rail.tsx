"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, LayoutDashboard, PenTool } from "lucide-react";
import { UserButton, useUser } from "@clerk/nextjs";

const SECTIONS = [
  { href: "/console", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/cowork", label: "Cowork", icon: PenTool, exact: false },
];

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

      {/* footer — one clean block: avatar + workspace (company) + your name */}
      <div className={`mt-2 ${collapsed ? "flex justify-center" : "px-2"}`}>
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
