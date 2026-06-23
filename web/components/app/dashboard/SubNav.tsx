"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Brain,
  Droplets,
  Eye,
  Filter,
  Megaphone,
  MessageSquare,
  Radio,
  Settings,
} from "lucide-react";

// Operational sections of the "This Week" page (anchor-scroll within /console)
const SECTIONS = [
  { id: "approvals", label: "Approvals", icon: Bell, badge: null },
  { id: "angles", label: "Eagle-View", icon: Eye, badge: null },
  { id: "campaigns", label: "Campaigns", icon: Megaphone, badge: null },
  { id: "comments", label: "Comments", icon: MessageSquare, badge: null },
  { id: "brain", label: "The Brain", icon: Brain, badge: null },
] as const;

// Analytics deep-dives (their own routes)
const PAGES = [
  { href: "/console/leaks", label: "Leaks", icon: Droplets },
  { href: "/console/channels", label: "Channels", icon: Radio },
  { href: "/console/funnel", label: "Funnel", icon: Filter },
] as const;

const ITEM =
  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors duration-200";

/** Dashboard sub-nav: the operational "This Week" sections + the analytics deep-dives. */
export default function SubNav() {
  const pathname = usePathname();
  const onThisWeek = pathname === "/console";
  const [active, setActive] = useState("approvals");

  return (
    <nav className="flex h-full flex-col gap-0.5 border-r border-line bg-[var(--sidebar)] p-3">
      <Link
        href="/console"
        className="px-2.5 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-mute-2 transition-colors duration-200 hover:text-mute"
      >
        This Week
      </Link>
      {SECTIONS.map(({ id, label, icon: Icon, badge }) => {
        const on = onThisWeek && active === id;
        return (
          <Link
            key={id}
            href={`/console#${id}`}
            onClick={() => setActive(id)}
            aria-current={on ? "true" : undefined}
            className={`${ITEM} ${on ? "bg-surface text-ink" : "text-mute hover:bg-surface/60 hover:text-ink"}`}
          >
            <Icon size={16} strokeWidth={on ? 2.4 : 2} className={on ? "text-molten" : ""} aria-hidden />
            <span className="flex-1">{label}</span>
            {badge && (
              <span className="font-data rounded-full bg-molten/15 px-1.5 text-[10px] font-semibold text-molten">
                {badge}
              </span>
            )}
          </Link>
        );
      })}

      <p className="px-2.5 pb-2 pt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-mute-2">
        Analytics
      </p>
      {PAGES.map(({ href, label, icon: Icon }) => {
        const on = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`${ITEM} ${on ? "bg-surface text-ink" : "text-mute hover:bg-surface/60 hover:text-ink"}`}
          >
            <Icon size={16} strokeWidth={on ? 2.4 : 2} className={on ? "text-molten" : ""} aria-hidden />
            {label}
          </Link>
        );
      })}

      <div className="mt-auto">
        <Link
          href="/console/settings"
          className={`${ITEM} text-mute hover:bg-surface/60 hover:text-ink`}
        >
          <Settings size={16} aria-hidden />
          Settings
        </Link>
      </div>
    </nav>
  );
}
