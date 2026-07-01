"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DashboardFrame from "@/components/app/dashboard/DashboardFrame";
import PageHeader from "@/components/dashboard/PageHeader";
import { SkeletonRows } from "@/components/app/ui/Skeleton";
import { ArrowUpRight, Clapperboard, FileText } from "lucide-react";

type ContentItem = {
  item_id: string;
  platform: string;
  format: string;
  body: string;
  status: string;
};

const PLATFORM_LABEL: Record<string, string> = {
  meta: "Meta",
  x: "X",
  linkedin: "LinkedIn",
  ig: "Instagram",
  instagram: "Instagram",
  reddit: "Reddit",
  google: "Google",
};

type Tab = "all" | "posts" | "scripts";

/** The content library — everything the CMO has produced, filterable by type.
 *  Posts and reel scripts land here from Comrk runs. */
export default function ContentLibraryClient() {
  const [items, setItems] = useState<ContentItem[] | null>(null);
  const [tab, setTab] = useState<Tab>("all");

  useEffect(() => {
    let active = true;
    fetch("/api/content?limit=100", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active) return;
        setItems(Array.isArray(d) ? d : []);
      })
      .catch(() => {
        if (active) setItems([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const scripts = useMemo(() => (items ?? []).filter((c) => c.format === "reel_script"), [items]);
  const posts = useMemo(() => (items ?? []).filter((c) => c.format !== "reel_script"), [items]);
  const shown = tab === "posts" ? posts : tab === "scripts" ? scripts : (items ?? []);

  return (
    <DashboardFrame>
      <PageHeader
        eyebrow="Everything the CMO has written"
        title="Content & scripts"
        sub="Platform-ready posts and reel scripts from your runs — copy, tweak, ship."
      />

      {/* filter chips */}
      <div className="mb-4 flex items-center gap-2">
        {(
          [
            { key: "all", label: `All ${items ? `· ${items.length}` : ""}` },
            { key: "posts", label: `Posts ${items ? `· ${posts.length}` : ""}` },
            { key: "scripts", label: `Scripts ${items ? `· ${scripts.length}` : ""}` },
          ] as { key: Tab; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
              tab === t.key
                ? "bg-molten/10 text-molten"
                : "border border-line bg-surface text-mute-2 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {items === null ? (
        <div className="rounded-2xl border border-line bg-surface p-4">
          <SkeletonRows rows={5} />
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-line bg-surface px-6 py-14 text-center">
          <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-line bg-surface-2">
            <FileText size={22} className="text-mute-2" aria-hidden />
          </span>
          <p className="text-[14px] font-semibold text-ink">Nothing here yet</p>
          <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-mute">
            Start a run in Comrk and the CMO fills this library with platform-ready posts and
            scripts.
          </p>
          <Link
            href="/cowork"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-molten px-4 py-2 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90"
          >
            Start a run <ArrowUpRight size={14} aria-hidden />
          </Link>
        </div>
      ) : (
        <div className="space-y-2.5">
          {shown.map((c) => (
            <div key={c.item_id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="mb-2 flex items-center gap-2">
                {c.format === "reel_script" ? (
                  <Clapperboard size={13} className="text-mute-2" aria-hidden />
                ) : (
                  <FileText size={13} className="text-mute-2" aria-hidden />
                )}
                <span className="font-data text-[10.5px] uppercase tracking-wide text-mute-2">
                  {PLATFORM_LABEL[c.platform] ?? c.platform} · {c.format === "reel_script" ? "script" : "post"}
                </span>
                <span className="ml-auto rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-mute-2">
                  {c.status}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
                {c.body?.length > 400 ? `${c.body.slice(0, 400)}…` : c.body}
              </p>
            </div>
          ))}
        </div>
      )}
    </DashboardFrame>
  );
}
