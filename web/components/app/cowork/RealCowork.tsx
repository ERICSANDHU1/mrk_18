"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Eye,
  Files,
  History,
  Mail,
  PlayCircle,
  Rocket,
  Send,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@/components/app/ui/Skeleton";
import StartRunButton from "./StartRunButton";
import DemoBanner from "@/components/app/DemoBanner";
import { COMRK_DEMO } from "@/lib/demo-mode";

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

const RUN_META: Record<string, { label: string; dot: string }> = {
  completed: { label: "Completed", dot: "bg-good" },
  failed: { label: "Failed", dot: "bg-bad" },
  awaiting_gate1: { label: "Review the strategy", dot: "bg-molten" },
  awaiting_gate2: { label: "Approve the content", dot: "bg-molten" },
};
const runMeta = (status: string) =>
  RUN_META[status] ?? {
    label: status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
    dot: "bg-watch",
  };

/** One stop of the execution pipeline — icon ring, count, label. Lights molten
 *  once work has reached it. */
function Stage({
  icon: Icon,
  n,
  label,
  sub,
  loading,
}: {
  icon: LucideIcon;
  n: number;
  label: string;
  sub: string;
  loading: boolean;
}) {
  const on = !loading && n > 0;
  return (
    <div className="flex w-20 shrink-0 flex-col items-center text-center sm:w-28">
      <span
        className={`grid h-9 w-9 place-items-center rounded-full border transition-colors ${
          on ? "border-molten/40 bg-molten/10 text-molten" : "border-line bg-surface-2 text-mute-2"
        }`}
      >
        <Icon size={15} aria-hidden />
      </span>
      {loading ? (
        <Skeleton className="mt-2 h-5 w-7 rounded-md" />
      ) : (
        <span className={`mt-1.5 text-[20px] font-semibold leading-none ${on ? "text-ink" : "text-mute-2"}`}>
          {n}
        </span>
      )}
      <span className={`mt-1 text-[11.5px] font-medium ${on ? "text-ink" : "text-mute"}`}>{label}</span>
      <span className="text-[10.5px] text-mute-2">{sub}</span>
    </div>
  );
}

function Widget({
  icon: Icon,
  title,
  aside,
  children,
}: {
  icon: LucideIcon;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-molten" aria-hidden />
          <span className="text-[13px] font-semibold text-ink">{title}</span>
        </div>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** Comrk — the execution desk, in the Chief design language: the CMO's read on
 *  the desk, the pipeline visualised (runs → review → approved → published),
 *  live content + run detail, and the not-yet-wired capabilities folded into
 *  one quiet card instead of shouting placeholders. */
export default function RealCowork({
  profile,
  demo = false,
}: {
  profile: FounderProfile;
  demo?: boolean;
}) {
  // Demo visitors start from sample data and never hit the backend.
  const [content, setContent] = useState<ContentItem[]>(
    demo ? (COMRK_DEMO.content as ContentItem[]) : [],
  );
  const [runs, setRuns] = useState<Run[]>(demo ? (COMRK_DEMO.runs as Run[]) : []);
  const [loading, setLoading] = useState(!demo);

  // in demo the run/content detail pages aren't populated, so their links point
  // to /pricing instead — you can see the desk, unlocking runs it for real
  const linkTo = (real: string) => (demo ? "/pricing" : real);

  useEffect(() => {
    if (demo) return;
    let active = true;
    const j = (u: string) =>
      fetch(u, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    Promise.all([j("/api/content?limit=50"), j("/api/runs")]).then(([c, r]) => {
      if (!active) return;
      setContent(Array.isArray(c) ? c : []);
      setRuns(Array.isArray(r) ? r : []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [demo]);

  const pending = runs.filter(
    (r) => r.status === "awaiting_gate1" || r.status === "awaiting_gate2",
  );
  const scripts = content.filter((c) => c.format === "reel_script");
  const posts = content.filter((c) => c.format !== "reel_script");
  const approvedN = content.filter((c) => c.status === "approved").length;
  const publishedN = content.filter((c) => c.status === "published").length;
  const recentRuns = [...runs]
    .sort((a, b) => +new Date(b.started_at) - +new Date(a.started_at))
    .slice(0, 5);

  const read = loading
    ? "Reading your desk…"
    : pending.length > 0
      ? `${pending.length} ${pending.length === 1 ? "item is" : "items are"} waiting on you — approve to keep the pipeline moving.`
      : approvedN > 0
        ? `${approvedN} approved ${approvedN === 1 ? "post" : "posts"} ready to ship — publishing connects soon.`
        : runs.length > 0
          ? "Desk is clear — start a run whenever you want fresh strategy and content."
          : "Start your first run — I'll turn your brief into strategy, posts and scripts for your approval.";

  return (
    <div className="flex h-full flex-col">
      {demo && <DemoBanner section="Comrk" />}
      <div className="dash-scroll min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-5 py-6">
        {/* header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-[28px] leading-none text-ink">Comrk</h1>
            <p className="mt-1.5 text-[12.5px] text-mute">{profile.company_name} · your execution desk</p>
          </div>
          {demo ? (
            <Link
              href="/pricing"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-[color:var(--cta-ink,#0a0a0b)]"
              style={{ background: "var(--gradient-brand)" }}
            >
              <Rocket size={14} aria-hidden /> Unlock to run
            </Link>
          ) : (
            <StartRunButton />
          )}
        </div>

        {/* CMO read — one line that says what matters; pending approvals live here */}
        <div className="mb-5 rounded-2xl border border-line border-l-[3px] border-l-molten bg-surface px-4 py-3.5">
          <div className="flex gap-3">
            <Zap size={17} className="mt-0.5 shrink-0 text-molten" aria-hidden />
            <p className="text-[13.5px] leading-relaxed text-ink">{read}</p>
          </div>
          {pending.length > 0 && (
            <div className="mt-3 space-y-1.5 pl-[29px]">
              {pending.map((r) => (
                <Link
                  key={r.run_id}
                  href={linkTo(`/cowork/run/${r.run_id}`)}
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
          )}
        </div>

        {/* the pipeline — the desk visualised, all real counts */}
        <div className="mb-3 rounded-2xl border border-line bg-surface p-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-ink">Execution pipeline</span>
            <span className="font-data text-[10.5px] uppercase tracking-wide text-mute-2">
              run → review → ship
            </span>
          </div>
          <div className="dash-scroll flex items-start overflow-x-auto pb-1">
            <Stage icon={PlayCircle} n={runs.length} label="Runs" sub="all time" loading={loading} />
            <div
              aria-hidden
              className={`mt-[18px] h-px min-w-4 flex-1 ${!loading && pending.length > 0 ? "bg-molten/40" : "bg-line"}`}
            />
            <Stage icon={Eye} n={pending.length} label="In review" sub="waiting on you" loading={loading} />
            <div
              aria-hidden
              className={`mt-[18px] h-px min-w-4 flex-1 ${!loading && approvedN > 0 ? "bg-molten/40" : "bg-line"}`}
            />
            <Stage icon={CheckCircle2} n={approvedN} label="Approved" sub="ready to ship" loading={loading} />
            <div
              aria-hidden
              className={`mt-[18px] h-px min-w-4 flex-1 ${!loading && publishedN > 0 ? "bg-molten/40" : "bg-line"}`}
            />
            <Stage
              icon={Send}
              n={publishedN}
              label="Published"
              sub={publishedN > 0 ? "live" : "connect a channel"}
              loading={loading}
            />
          </div>
        </div>

        {/* detail — live content + live runs */}
        <div className="grid gap-3 md:grid-cols-2">
          <Widget
            icon={Files}
            title="Content & scripts"
            aside={
              !loading &&
              content.length > 0 && (
                <span className="font-data text-[10.5px] uppercase tracking-wide text-mute-2">
                  {posts.length} posts · {scripts.length} scripts
                </span>
              )
            }
          >
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-7 w-full rounded-lg" />
                <Skeleton className="h-7 w-full rounded-lg" />
                <Skeleton className="h-7 w-3/4 rounded-lg" />
              </div>
            ) : content.length === 0 ? (
              <p className="text-[12.5px] leading-relaxed text-mute">
                Nothing yet — start a run to generate posts and scripts from your company memory.
              </p>
            ) : (
              <div className="space-y-1">
                {content.slice(0, 5).map((c) => (
                  <Link
                    key={c.item_id}
                    // deep-link straight to this post's slide in the run deck
                    href={linkTo(`/cowork/run/${c.run_id}?item=${c.item_id}`)}
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
            )}
          </Widget>

          <Widget icon={History} title="Recent runs">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-7 w-full rounded-lg" />
                <Skeleton className="h-7 w-full rounded-lg" />
                <Skeleton className="h-7 w-3/4 rounded-lg" />
              </div>
            ) : recentRuns.length === 0 ? (
              <p className="text-[12.5px] leading-relaxed text-mute">
                No runs yet — your first run will show up here.
              </p>
            ) : (
              <div className="space-y-1">
                {recentRuns.map((r) => {
                  const m = runMeta(r.status);
                  return (
                    <Link
                      key={r.run_id}
                      href={linkTo(`/cowork/run/${r.run_id}`)}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12.5px] transition-colors hover:bg-surface-2"
                    >
                      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${m.dot}`} />
                      <span className="min-w-0 flex-1 truncate text-ink">{m.label}</span>
                      <span className="font-data shrink-0 text-[11px] text-mute-2">
                        {fmtDate(r.started_at)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </Widget>
        </div>

        {/* what's next — the unwired capabilities, one quiet card */}
        <div className="mt-3 rounded-2xl border border-line bg-surface p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-ink">Coming online next</span>
            <span className="shrink-0 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-mute-2">
              Soon
            </span>
          </div>
          <div className="divide-y divide-[var(--line-soft)]">
            {[
              {
                icon: CalendarClock,
                title: "Publishing & scheduling",
                line: "Queue approved posts and auto-publish across LinkedIn and X.",
              },
              {
                icon: Rocket,
                title: "Campaigns",
                line: "Launch and manage live ad campaigns from the desk.",
              },
              {
                icon: Mail,
                title: "Mail & calendar",
                line: "Handle updates and schedule work without leaving Comrk.",
              },
            ].map(({ icon: Icon, title, line }) => (
              <div key={title} className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
                <Icon size={14} className="shrink-0 text-mute-2" aria-hidden />
                <span className="shrink-0 text-[12.5px] font-medium text-ink">{title}</span>
                <span className="min-w-0 truncate text-[12px] text-mute-2">{line}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
