"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Droplets, Filter, LayoutGrid, Radio, Settings } from "lucide-react";

// Analytics deep-dives — their own routes (honest "connect data" placeholders for now).
const PAGES = [
  { href: "/console/leaks", label: "Leaks", icon: Droplets },
  { href: "/console/channels", label: "Channels", icon: Radio },
  { href: "/console/funnel", label: "Funnel", icon: Filter },
] as const;

const ITEM =
  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors duration-200";

/** Dashboard sub-nav: the This Week overview + the analytics deep-dives. In-page
 *  anchor links were removed — the overview is a short single screen, so scrolling
 *  to sections that are already visible was redundant. Real section nav returns if
 *  the page grows long enough to warrant it. */
export default function SubNav() {
  const pathname = usePathname();
  const onHome = pathname === "/console";

  return (
    <nav className="flex h-full flex-col gap-0.5 border-r border-line bg-[var(--sidebar)] p-3">
      <Link
        href="/console"
        aria-current={onHome ? "page" : undefined}
        className={`${ITEM} mt-1 ${onHome ? "bg-surface text-ink" : "text-mute hover:bg-surface/60 hover:text-ink"}`}
      >
        <LayoutGrid size={16} strokeWidth={onHome ? 2.4 : 2} className={onHome ? "text-molten" : ""} aria-hidden />
        This Week
      </Link>

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
          aria-current={pathname.startsWith("/console/settings") ? "page" : undefined}
          className={`${ITEM} ${pathname.startsWith("/console/settings") ? "bg-surface text-ink" : "text-mute hover:bg-surface/60 hover:text-ink"}`}
        >
          <Settings size={16} aria-hidden />
          Settings
        </Link>
      </div>
    </nav>
  );
}
