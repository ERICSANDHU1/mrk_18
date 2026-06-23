import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Clock, FileText, Loader2, Plug, TriangleAlert } from "lucide-react";
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

async function load(): Promise<{ ok: boolean; founderId: string | null; runs: Run[]; pending: Item[] }> {
  try {
    const founderId = await getFounderId();
    if (!founderId) return { ok: true, founderId: null, runs: [], pending: [] };
    const runsRes = await backendFetch(`/founders/${founderId}/runs?limit=10`);
    const runs: Run[] = runsRes.ok ? await runsRes.json().catch(() => []) : [];
    const pending: Item[] = [];
    for (const run of runs.filter((r) => r.status === "awaiting_gate2")) {
      const itemsRes = await backendFetch(`/runs/${run.run_id}/items`);
      const items: Item[] = itemsRes.ok ? await itemsRes.json().catch(() => []) : [];
      pending.push(
        ...items.filter((i) => i.status === "awaiting_approval").map((i) => ({ ...i, run_id: run.run_id })),
      );
    }
    return { ok: true, founderId, runs, pending };
  } catch {
    // backend unreachable (e.g. API not running) — degrade, never crash the page
    return { ok: false, founderId: null, runs: [], pending: [] };
  }
}

function fmtDate(s: string): string {
  try {
    return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

/** This Week — the real operational feed: what needs the founder, and recent runs. */
export default async function ConsoleDashboard() {
  const { ok, founderId, runs, pending } = await load();
  const hasRuns = !!founderId && runs.length > 0;

  return (
    <DashboardFrame>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-mute-2">This week</p>
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
      ) : !hasRuns ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
          <span className="mb-4 rounded-xl border border-line bg-surface-2 p-3 text-mute">
            <FileText size={20} aria-hidden />
          </span>
          <h3 className="text-[15px] font-bold">No runs yet</h3>
          <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-mute">
            Start a run and your CMO will research your market and draft a week of content for your
            approval.
          </p>
          <Link
            href="/cowork"
            className="mt-5 rounded-lg bg-gradient-to-r from-molten via-amber to-ember px-4 py-2 text-[13px] font-bold text-white transition-opacity duration-200 hover:opacity-90"
          >
            Start a run
          </Link>
        </div>
      ) : (
        <>
          {/* Pending approvals — real, from runs sitting at Gate 2 */}
          <section id="approvals" className="rounded-2xl border border-line bg-surface p-5">
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
                      className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-molten via-amber to-ember px-3 py-1.5 text-[12px] font-bold text-white"
                    >
                      Review <ArrowRight size={12} aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Recent runs — real */}
          <section className="rounded-2xl border border-line bg-surface p-5">
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
                      <span className="font-data text-[11px] text-mute-2">
                        ₹{Number(r.cost_inr).toFixed(2)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

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
