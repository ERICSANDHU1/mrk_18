"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, Files, Mail, Rocket, Send } from "lucide-react";
import StartRunButton from "./StartRunButton";

export interface FounderProfile {
  company_name: string;
  website: string;
  product_description: string;
  icp: string;
  top_competitors: string[];
  tone: string;
  primary_goal: string;
  monthly_spend_inr: number;
  target_platforms: string[];
}

type Run = { run_id: string; status: string; started_at: string };
type ContentItem = {
  item_id: string;
  run_id: string;
  platform: string;
  format: string;
  body: string;
  status: string;
};

const PLATFORM_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  x: "X",
  instagram: "Instagram",
  ig: "Instagram",
};

const fmtDate = (s: string) => {
  try {
    return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
};

/** A subtle status chip marking a widget as a frontend preview — the UI is
 *  rendered but the feature isn't wired to the backend yet. */
function ComingSoon() {
  return (
    <span className="shrink-0 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-mute-2">
      Coming soon
    </span>
  );
}

function Widget({
  icon: Icon,
  title,
  comingSoon,
  children,
}: {
  icon: typeof Files;
  title: string;
  comingSoon?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-molten" aria-hidden />
          <span className="text-[13px] font-semibold text-ink">{title}</span>
        </div>
        {comingSoon && <ComingSoon />}
      </div>
      {children}
    </div>
  );
}

function Dormant({ children }: { children: React.ReactNode }) {
  return <p className="py-0.5 text-[12.5px] leading-relaxed text-mute">{children}</p>;
}

/** Comrk — the execution desk. Start runs, approve what's pending, and (as
 *  connectors come online) schedule, publish, and run campaigns. Content &
 *  scripts are live; publishing / campaigns / mail wait on their connector. */
export default function RealCowork({ profile }: { profile: FounderProfile }) {
  const [content, setContent] = useState<ContentItem[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);

  useEffect(() => {
    let active = true;
    const j = (u: string) =>
      fetch(u, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    Promise.all([j("/api/content?limit=50"), j("/api/runs")]).then(([c, r]) => {
      if (!active) return;
      setContent(Array.isArray(c) ? c : []);
      setRuns(Array.isArray(r) ? r : []);
    });
    return () => {
      active = false;
    };
  }, []);

  const pending = runs.filter(
    (r) => r.status === "awaiting_gate1" || r.status === "awaiting_gate2",
  );
  const scripts = content.filter((c) => c.format === "reel_script");
  const posts = content.filter((c) => c.format !== "reel_script");

  return (
    <div className="dash-scroll h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-5 py-6">
        {/* header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-[28px] leading-none text-ink">Comrk</h1>
            <p className="mt-1.5 text-[12.5px] text-mute">{profile.company_name} · your execution desk</p>
          </div>
          <StartRunButton />
        </div>

        {/* needs approval — keep pending runs reachable */}
        {pending.length > 0 && (
          <div className="mb-5 rounded-2xl border border-line border-l-[3px] border-l-molten bg-surface p-4">
            <p className="mb-2 text-[12px] font-semibold text-ink">Needs your approval</p>
            <div className="space-y-1.5">
              {pending.map((r) => (
                <Link
                  key={r.run_id}
                  href={`/cowork/run/${r.run_id}`}
                  className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] transition-colors hover:bg-molten/10"
                >
                  <span className="text-ink">
                    {r.status === "awaiting_gate1" ? "Review the strategy" : "Approve the content"} ·{" "}
                    {fmtDate(r.started_at)}
                  </span>
                  <ArrowRight size={14} className="text-mute-2" aria-hidden />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* schedule — dormant */}
        <Widget icon={CalendarClock} title="This week" comingSoon>
          <Dormant>Connect publishing to schedule posts across your channels.</Dormant>
        </Widget>

        {/* grid */}
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {/* Content & scripts — live */}
          <Widget icon={Files} title="Content & scripts">
            {content.length === 0 ? (
              <p className="text-[12.5px] leading-relaxed text-mute">
                Nothing yet — start a run to generate posts and scripts from your company memory.
              </p>
            ) : (
              <div>
                <div className="mb-2.5 flex gap-2">
                  <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-[12px] text-mute">
                    {posts.length} posts
                  </span>
                  <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-[12px] text-mute">
                    {scripts.length} scripts
                  </span>
                </div>
                <div className="space-y-1">
                  {content.slice(0, 4).map((c) => (
                    <Link
                      key={c.item_id}
                      href={`/cowork/run/${c.run_id}`}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[12.5px] transition-colors hover:bg-surface-2"
                    >
                      <span className="truncate text-ink">
                        <span className="text-mute-2">{PLATFORM_LABEL[c.platform] ?? c.platform} · </span>
                        {c.body?.slice(0, 38)}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                          c.status === "approved"
                            ? "bg-good/10 text-good"
                            : c.status === "published"
                              ? "bg-molten/10 text-molten"
                              : "bg-surface-2 text-mute-2"
                        }`}
                      >
                        {c.status}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </Widget>

          {/* Publishing queue — dormant */}
          <Widget icon={Send} title="Publishing queue" comingSoon>
            <Dormant>Connect a channel (LinkedIn, X) to queue and auto-publish approved content.</Dormant>
          </Widget>

          {/* Campaigns running — dormant */}
          <Widget icon={Rocket} title="Campaigns running" comingSoon>
            <Dormant>Connect your ad account to launch and manage live campaigns from here.</Dormant>
          </Widget>

          {/* Mail & calendar — dormant */}
          <Widget icon={Mail} title="Mail & calendar" comingSoon>
            <Dormant>Connect Gmail and Calendar to handle updates and schedule work from here.</Dormant>
          </Widget>
        </div>
      </div>
    </div>
  );
}
