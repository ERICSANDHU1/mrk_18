"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Loader2,
  RefreshCw,
  Scissors,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import ConnectDataState from "./ConnectDataState";

type Diag = {
  headline?: string;
  working?: string[];
  leaking?: string[];
  scale?: string[];
  cut?: string[];
  next_move?: string;
};
type Campaign = {
  name: string;
  spend?: number | null;
  roas?: number | null;
  conversions?: number | null;
};
type Metrics = { total_spend?: number; currency?: string | null; campaigns?: Campaign[] };
type Latest = {
  diagnosis: Diag | null;
  metrics: Metrics | null;
  source?: string;
  period?: string | null;
  created_at?: string;
};

function fmtMoney(amount: number, currency?: string | null): string {
  const code = currency || "INR";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: code, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString("en-IN")}`;
  }
}

function Block({ icon: Icon, title, items, tone }: { icon: LucideIcon; title: string; items?: string[]; tone: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="rounded-xl border border-stroke-2 bg-surface p-4">
      <h4 className={`mb-2 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide ${tone}`}>
        <Icon size={13} aria-hidden /> {title}
      </h4>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="text-[13px] leading-relaxed text-ink/90">
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Three states: connect (no data) → review & approve gate (data pulled, not yet
 *  analysed) → the CMO diagnosis. Pulling ad data NEVER auto-runs the analysis —
 *  the founder approves it explicitly. Reads /api/analytics/latest. */
export default function AdAnalyticsPanel({ metric = "This view" }: { metric?: string }) {
  const [data, setData] = useState<Latest | null>(null);
  const [running, setRunning] = useState(false);
  const [repulling, setRepulling] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/analytics/latest", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d ?? { diagnosis: null, metrics: null }))
      .catch(() => setData({ diagnosis: null, metrics: null }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Approval action: run the CMO analysis on the pending pull.
  const runAnalysis = async () => {
    setRunning(true);
    setErr(null);
    try {
      const res = await fetch("/api/analytics/run-analysis", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body?.error || "Couldn't run the analysis — try again.");
        setRunning(false);
        return;
      }
      load(); // re-fetch → the row now carries the diagnosis
    } catch {
      setErr("Couldn't reach the server.");
      setRunning(false);
    }
  };

  // Re-pull fresh numbers from Meta (creates a new pending snapshot → re-gates).
  const repull = async () => {
    setRepulling(true);
    setErr(null);
    try {
      const res = await fetch("/api/analytics/sync-meta", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body?.error || "Couldn't pull fresh data — try again.");
        setRepulling(false);
        return;
      }
      load();
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setRepulling(false);
    }
  };

  if (data === null) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-muted" size={20} aria-hidden />
      </div>
    );
  }

  const d = data.diagnosis;
  const m = data.metrics;
  const hasData = !!m && Array.isArray(m.campaigns) && m.campaigns.length > 0;

  // ── Pending gate / connect prompt (no diagnosis yet) ──────────────────────
  if (!d) {
    if (!hasData) return <ConnectDataState metric={metric} />;
    const campaigns = m!.campaigns!;
    return (
      <div className="grid gap-4">
        <div className="rounded-2xl border border-molten/30 bg-molten/[0.06] p-5">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-molten">
            <Sparkles size={13} aria-hidden /> Ad data ready · {data.period ?? "all time"}
          </p>
          <h3 className="mt-1.5 text-[18px] font-bold leading-snug text-ink">
            Your Meta ad data is pulled — review it, then run your CMO analysis.
          </h3>
          <p className="mt-1 text-[12.5px] text-muted">
            {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"} ·{" "}
            {typeof m!.total_spend === "number" ? fmtMoney(m!.total_spend, m!.currency) : "—"} total spend.
            Nothing is analysed until you approve.
          </p>
          <button
            onClick={runAnalysis}
            disabled={running}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-molten via-amber to-ember px-4 py-2.5 text-[13px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {running ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
            {running ? "Analysing…" : "Run CMO analysis"}
          </button>
          {err && <p className="mt-2 text-[12px] font-semibold text-bad">{err}</p>}
        </div>

        {/* the pulled numbers, for review before approving */}
        <div className="rounded-2xl border border-stroke-2 bg-surface p-5">
          <h4 className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
            <BarChart3 size={13} aria-hidden /> Pulled campaigns
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-muted">
                  <th className="pb-2 font-semibold">Campaign</th>
                  <th className="pb-2 text-right font-semibold">Spend</th>
                  <th className="pb-2 text-right font-semibold">ROAS</th>
                  <th className="pb-2 text-right font-semibold">Conv.</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c, i) => (
                  <tr key={i} className="border-t border-stroke-2">
                    <td className="py-2 pr-2 text-ink">{c.name}</td>
                    <td className="py-2 text-right text-ink/90">
                      {typeof c.spend === "number" ? fmtMoney(c.spend, m!.currency) : "—"}
                    </td>
                    <td className="py-2 text-right text-ink/90">
                      {typeof c.roas === "number" ? `${c.roas.toFixed(2)}×` : "—"}
                    </td>
                    <td className="py-2 text-right text-ink/90">
                      {typeof c.conversions === "number" ? c.conversions : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ── The CMO diagnosis (approved + analysed) ───────────────────────────────
  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-stroke-2 bg-surface p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          CMO read{data.period ? ` · ${data.period}` : ""}
          {data.source ? ` · via ${data.source}` : ""}
        </p>
        {d.headline && <h3 className="mt-1.5 text-[18px] font-bold leading-snug text-ink">{d.headline}</h3>}
        {typeof m?.total_spend === "number" && (
          <p className="mt-1 text-[12.5px] text-muted">Spend analysed: {fmtMoney(m.total_spend, m.currency)}</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Block icon={TrendingDown} title="Leaking" items={d.leaking} tone="text-bad" />
        <Block icon={Scissors} title="Cut" items={d.cut} tone="text-bad" />
        <Block icon={TrendingUp} title="Working" items={d.working} tone="text-good" />
        <Block icon={ArrowUpRight} title="Scale" items={d.scale} tone="text-good" />
      </div>

      {d.next_move && (
        <div className="rounded-2xl border border-molten/30 bg-molten/10 p-5">
          <h4 className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-molten">
            <Target size={13} aria-hidden /> Next move
          </h4>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink">{d.next_move}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={repull}
          disabled={repulling}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted transition-colors hover:text-ink disabled:opacity-50"
        >
          {repulling ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <RefreshCw size={12} aria-hidden />}
          Pull fresh data from Meta
        </button>
        {err && <span className="text-[12px] font-semibold text-bad">{err}</span>}
      </div>
    </div>
  );
}
