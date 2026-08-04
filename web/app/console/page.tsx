import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Brain,
  Check,
  Clock,
  FileText,
  Loader2,
  MessageSquare,
  Plug,
  Search,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import DashboardFrame from "@/components/app/dashboard/DashboardFrame";
import { backendFetch, getFounderId } from "@/lib/server/backend";

export const metadata: Metadata = { title: "Dashboard" };

type Run = {
  run_id: string;
  status: string;
  cost_inr: number;
  started_at: string;
  finished_at: string | null;
};
type Item = { item_id: string; platform: string; format: string; status: string; run_id: string };

const STATUS_LABEL: Record<string, string> = {
  generating: "Researching",
  awaiting_gate1: "Awaiting your review",
  generating_content: "Writing content",
  awaiting_gate2: "Awaiting your approval",
  publishing: "Publishing",
  done: "Done",
  failed: "Failed",
};
const PLATFORM: Record<string, string> = { linkedin: "LinkedIn", x: "X", instagram: "Instagram" };

type Profile = {
  company_name?: string;
  product_description?: string;
  icp?: string;
  tone?: string;
  primary_goal?: string;
  website?: string;
} | null;

type Loaded = {
  ok: boolean;
  founderId: string | null;
  runs: Run[];
  pending: Item[];
  profile: Profile;
};

async function load(): Promise<Loaded> {
  try {
    const founderId = await getFounderId();
    if (!founderId) return { ok: true, founderId: null, runs: [], pending: [], profile: null };

    const runsRes = await backendFetch(`/founders/${founderId}/runs?limit=10`);
    const runs: Run[] = runsRes.ok ? await runsRes.json().catch(() => []) : [];

    // The Brain = the founder's real company memory (the validated intake profile).
    const intakeRes = await backendFetch(`/founders/${founderId}/intake`);
    const intake = intakeRes.ok ? await intakeRes.json().catch(() => null) : null;
    const profile: Profile = intake?.profile ?? null;

    const pending: Item[] = [];
    for (const run of runs.filter((r) => r.status === "awaiting_gate2")) {
      const itemsRes = await backendFetch(`/runs/${run.run_id}/items`);
      const items: Item[] = itemsRes.ok ? await itemsRes.json().catch(() => []) : [];
      pending.push(
        ...items.filter((i) => i.status === "awaiting_approval").map((i) => ({ ...i, run_id: run.run_id })),
      );
    }
    return { ok: true, founderId, runs, pending, profile };
  } catch {
    // backend unreachable (e.g. API not running) — degrade, never crash the page
    return { ok: false, founderId: null, runs: [], pending: [], profile: null };
  }
}

function fmtDate(s: string): string {
  try {
    return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

/** product_description is a multi-part blob (one-liner + USP + problem). Show the
 *  first meaningful line, trimmed, for the compact Brain card. */
function firstLine(s?: string): string {
  if (!s) return "—";
  const line = s.split("\n").find((l) => l.trim()) ?? s;
  const t = line.trim();
  return t.length > 200 ? `${t.slice(0, 200).trim()}…` : t;
}

function BrainRow({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-mute-2">{label}</dt>
      <dd className="mt-0.5 text-[13px] leading-relaxed text-ink/90">{value?.trim() || "—"}</dd>
    </div>
  );
}

/** This Week — the real operational feed: what needs the founder, and recent runs. */
export default async function ConsoleDashboard() {
  const { ok, founderId, runs, pending, profile } = await load();

  return (
    <DashboardFrame>
      <div>
        <h1 className="font-display mt-1 text-2xl">What your CMO is working on</h1>
      </div>

      {!ok ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ember/30 bg-ember/[0.05] px-6 py-14 text-center">
          <span className="mb-4 rounded-xl border border-ember/30 bg-surface-2 p-3 text-ember">
            <TriangleAlert size={20} aria-hidden />
          </span>
          <h3 className="text-[15px] font-bold">Couldn&apos;t reach your CMO</h3>
          <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-mute">
            The backend API didn&apos;t respond. Make sure it&apos;s running, then refresh.
          </p>
        </div>
      ) : (
        <>
          {/* Pending approvals — real, from runs sitting at Gate 2 */}
          <section
            id="approvals"
            className={`rounded-2xl border border-line bg-surface p-5 ${
              pending.length > 0 ? "border-l-[3px] border-l-molten" : ""
            }`}
          >
            <h2 className="flex items-center gap-2 text-[14px] font-bold">
              <Clock size={15} className="text-molten" aria-hidden /> Waiting on you
            </h2>
            {pending.length === 0 ? (
              <p className="mt-2 text-[13px] text-mute">Nothing needs your approval right now.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {pending.map((it) => (
                  <li
                    key={it.item_id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-3"
                  >
                    <span className="text-[13px]">
                      <span className="font-semibold">{PLATFORM[it.platform] ?? it.platform}</span>
                      <span className="text-mute"> · {it.format.replace(/_/g, " ")} awaiting approval</span>
                    </span>
                    <Link
                      href={`/cowork/run/${it.run_id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-molten px-3 py-1.5 text-[12px] font-bold text-white"
                    >
                      Review <ArrowRight size={12} aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Recent runs — real */}
          <section id="runs" className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-[14px] font-bold">Recent runs</h2>
            <ul className="mt-3 space-y-2">
              {runs.map((r) => {
                const terminal = r.status === "done" || r.status === "failed";
                return (
                  <li key={r.run_id}>
                    <Link
                      href={`/cowork/run/${r.run_id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-3 transition-colors duration-150 hover:border-molten/30"
                    >
                      <span className="flex items-center gap-2.5 text-[13px]">
                        {r.status === "failed" ? (
                          <TriangleAlert size={14} className="text-ember" aria-hidden />
                        ) : terminal ? (
                          <Check size={14} className="text-molten" aria-hidden />
                        ) : (
                          <Loader2 size={14} className="animate-spin text-mute-2" aria-hidden />
                        )}
                        <span className="font-semibold">{STATUS_LABEL[r.status] ?? r.status}</span>
                        <span className="text-mute-2">· {fmtDate(r.started_at)}</span>
                      </span>
                      <ArrowRight size={14} className="text-mute-2" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      {/* The Brain — REAL: the company memory your CMO reasons from */}
      {profile && (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-bold">
            <Brain size={15} className="text-molten" aria-hidden /> The Brain — what your CMO knows
          </h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <BrainRow label="What you do" value={firstLine(profile.product_description)} />
            <BrainRow label="Who it's for" value={profile.icp} />
            <BrainRow label="Voice" value={profile.tone} />
            <BrainRow label="Goal right now" value={profile.primary_goal} />
          </dl>
          <Link
            href="/console/settings"
            className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-bold text-molten transition-opacity duration-200 hover:opacity-80"
          >
            Edit memory in Settings <ArrowRight size={13} aria-hidden />
          </Link>
        </section>
      )}

      {/* Comments — honest: real drafted replies appear once posts are live */}
      <section className="rounded-2xl border border-dashed border-line bg-surface p-5">
        <h2 className="flex items-center gap-2 text-[14px] font-bold">
          <MessageSquare size={15} className="text-mute-2" aria-hidden /> Comments
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-mute">
          Your CMO drafts replies to comments on your posts — you approve before anything sends. They
          appear here once your posts are live and people start engaging.
        </p>
      </section>

      {/* Marketing analytics — honest: real only once data is connected */}
      <section className="rounded-2xl border border-dashed border-line bg-surface p-5">
        <h2 className="flex items-center gap-2 text-[14px] font-bold">
          <Plug size={15} className="text-mute-2" aria-hidden /> Marketing analytics
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-mute">
          Leaks, channels, funnel and the weekly verdict come from your real numbers — they unlock
          when you connect GA4, your ad accounts and Stripe.{" "}
          <span className="text-mute-2">Data connectors coming soon.</span>
        </p>
      </section>
    </DashboardFrame>
  );
}
