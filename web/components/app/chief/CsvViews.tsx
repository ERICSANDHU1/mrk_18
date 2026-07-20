"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Scissors,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Logo from "@/components/app/Logo";
import { CampaignBars, SpendTrend } from "@/components/charts/AdCharts";
import type { CampaignAgg, ParsedCsv } from "./metaCsv";
import type { Diagnosis } from "./runsStore";

export const fmtMoney = (n: number | null, currency: string) =>
  n == null
    ? "—"
    : `${currency}${n.toLocaleString(currency === "₹" ? "en-IN" : "en-US", { maximumFractionDigits: 2 })}`;

/* ── summary strip ─────────────────────────────────────────────────────── */
export function SummaryStrip({ parsed }: { parsed: ParsedCsv }) {
  const cur = parsed.currency;
  const s = parsed.summary;
  const cells = [
    { label: "Total spend", value: fmtMoney(s.totalSpend, cur) },
    { label: "Impressions", value: s.impressions ? s.impressions.toLocaleString() : "—" },
    { label: "Clicks", value: s.clicks ? s.clicks.toLocaleString() : "—" },
    { label: "Avg CTR", value: s.avgCtr != null ? `${s.avgCtr}%` : "—" },
    { label: "Avg CPC", value: s.avgCpc != null ? fmtMoney(s.avgCpc, cur) : "—" },
    {
      label: "Date range",
      value: s.dateFrom && s.dateTo ? `${s.dateFrom.slice(5)} → ${s.dateTo.slice(5)}` : "—",
    },
    { label: "Campaigns", value: String(s.campaignCount) },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className="rounded-xl bg-surface-2 px-2.5 py-2">
          <div className="text-[10.5px] text-mute-2">{c.label}</div>
          <div className="mt-0.5 truncate text-[13.5px] font-semibold text-ink" title={c.value}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── spend charts (over time + top by spend) ────────────────────── */
export function SpendCharts({ parsed }: { parsed: ParsedCsv }) {
  const cur = parsed.currency;
  const topSpend = parsed.campaigns.filter((c) => c.spend != null).slice(0, 8);
  const hasDaily = parsed.daily.length >= 2;
  if (!hasDaily && topSpend.length === 0) return null;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <SpendTrend
        data={parsed.daily}
        note={`${cur || "¤"} / day`}
        formatValue={(n) => fmtMoney(n, cur)}
      />
      <CampaignBars
        rows={topSpend.map((c) => ({ name: c.name, value: c.spend }))}
        title="Top campaigns · spend"
        note={`top ${topSpend.length}`}
        label="Spend"
        formatValue={(n) => fmtMoney(n, cur)}
        fade
        className={hasDaily ? "" : "lg:col-span-2"}
      />
    </div>
  );
}

/* ── efficiency charts (CTR + CPC by campaign) ───────────────────── */
export function EfficiencyCharts({ parsed }: { parsed: ParsedCsv }) {
  const cur = parsed.currency;
  const ctrRows = parsed.campaigns.filter((c) => c.ctr != null).slice(0, 8);
  const cpcRows = parsed.campaigns.filter((c) => c.cpc != null).slice(0, 8);
  if (ctrRows.length === 0 && cpcRows.length === 0) return null;
  return (
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      <CampaignBars
        rows={ctrRows.map((c) => ({ name: c.name, value: c.ctr }))}
        title="CTR by campaign"
        note="%"
        label="CTR"
        formatValue={(n) => `${n}%`}
        color="var(--good)"
      />
      <CampaignBars
        rows={cpcRows.map((c) => ({ name: c.name, value: c.cpc }))}
        title="CPC by campaign"
        note={cur || "¤"}
        label="CPC"
        formatValue={(n) => fmtMoney(n, cur)}
        color="var(--watch)"
      />
    </div>
  );
}

/* ── campaign table (self-contained sort + pagination) ─────────────────── */
type SortKey = "name" | "spend" | "impressions" | "clicks" | "ctr" | "cpc" | "results";
const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "name", label: "Campaign", numeric: false },
  { key: "spend", label: "Spend", numeric: true },
  { key: "impressions", label: "Impressions", numeric: true },
  { key: "clicks", label: "Clicks", numeric: true },
  { key: "ctr", label: "CTR", numeric: true },
  { key: "cpc", label: "CPC", numeric: true },
  { key: "results", label: "Results", numeric: true },
];
const PAGE_SIZE = 50;

export function CampaignTable({ parsed }: { parsed: ParsedCsv }) {
  const cur = parsed.currency;
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "spend", dir: "desc" });
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...parsed.campaigns].sort((a, b) => {
      if (sort.key === "name") return a.name.localeCompare(b.name) * dir;
      const av = a[sort.key] ?? -Infinity;
      const bv = b[sort.key] ?? -Infinity;
      return (av === bv ? 0 : av > bv ? 1 : -1) * dir;
    });
  }, [parsed.campaigns, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const p = Math.min(page, pages - 1);
  const rows = sorted.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
  const onSort = (key: SortKey) => {
    setPage(0);
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" },
    );
  };

  return (
    <>
      <div className="dash-scroll overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[560px] text-left">
          <thead>
            <tr className="border-b border-line bg-surface-2/60">
              {COLUMNS.map((c) => (
                <th key={c.key} scope="col" className={c.numeric ? "text-right" : ""}>
                  <button
                    onClick={() => onSort(c.key)}
                    className={`flex w-full items-center gap-1 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                      sort.key === c.key ? "text-ink" : "text-mute-2 hover:text-ink"
                    } ${c.numeric ? "justify-end" : ""}`}
                  >
                    {c.label}
                    {sort.key === c.key &&
                      (sort.dir === "asc" ? <ArrowUp size={11} aria-hidden /> : <ArrowDown size={11} aria-hidden />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c: CampaignAgg) => (
              <tr key={c.name} className="border-b border-line/60 last:border-b-0">
                <td className="max-w-[220px] truncate px-3 py-2 text-[12.5px] text-ink" title={c.name}>
                  {c.name}
                </td>
                <td className="px-3 py-2 text-right font-data text-[12px] text-ink">{fmtMoney(c.spend, cur)}</td>
                <td className="px-3 py-2 text-right font-data text-[12px] text-mute">{c.impressions?.toLocaleString() ?? "—"}</td>
                <td className="px-3 py-2 text-right font-data text-[12px] text-mute">{c.clicks?.toLocaleString() ?? "—"}</td>
                <td className="px-3 py-2 text-right font-data text-[12px] text-mute">{c.ctr != null ? `${c.ctr}%` : "—"}</td>
                <td className="px-3 py-2 text-right font-data text-[12px] text-mute">{fmtMoney(c.cpc, cur)}</td>
                <td className="px-3 py-2 text-right font-data text-[12px] text-mute">{c.results?.toLocaleString() ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > PAGE_SIZE && (
        <div className="mt-2 flex items-center justify-end gap-2 text-[11.5px] text-mute-2">
          <span>
            {p * PAGE_SIZE + 1}–{Math.min((p + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
          </span>
          <button
            onClick={() => setPage((x) => Math.max(0, x - 1))}
            disabled={p === 0}
            aria-label="Previous page"
            className="grid h-6 w-6 place-items-center rounded-md border border-line text-mute transition-colors hover:text-ink disabled:opacity-40"
          >
            <ChevronLeft size={13} aria-hidden />
          </button>
          <button
            onClick={() => setPage((x) => Math.min(pages - 1, x + 1))}
            disabled={p >= pages - 1}
            aria-label="Next page"
            className="grid h-6 w-6 place-items-center rounded-md border border-line text-mute transition-colors hover:text-ink disabled:opacity-40"
          >
            <ChevronRight size={13} aria-hidden />
          </button>
        </div>
      )}
    </>
  );
}

/* ── the CMO's read — verdict header + 2×2 + next move ─────────────────── */
export function DiagnosisPanel({ analysis }: { analysis: NonNullable<Diagnosis> }) {
  const quadrants = [
    { label: "Working", items: analysis.working, Icon: TrendingUp, cls: "text-good" },
    { label: "Leaking", items: analysis.leaking, Icon: TrendingDown, cls: "text-bad" },
    { label: "Scale", items: analysis.scale, Icon: ArrowUpRight, cls: "text-molten" },
    { label: "Cut", items: analysis.cut, Icon: Scissors, cls: "text-mute" },
  ] as const;
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface-2/30">
      {analysis.headline && (
        <div className="flex items-start gap-3 border-b border-line bg-surface px-4 py-3.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-molten/25 bg-molten/[0.08]">
            <Logo size={15} />
          </span>
          <div className="min-w-0">
            <p className="font-data text-[10px] uppercase tracking-[0.16em] text-mute-2">Your CMO&apos;s read</p>
            <p className="font-claude-serif mt-0.5 text-[15px] leading-relaxed text-ink">{analysis.headline}</p>
          </div>
        </div>
      )}
      <div className="grid gap-px bg-line sm:grid-cols-2">
        {quadrants.map((q) => (
          <div key={q.label} className="bg-surface-2/30 p-4">
            <p className={`flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide ${q.cls}`}>
              <q.Icon size={12} aria-hidden /> {q.label}
            </p>
            {q.items && q.items.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {q.items.map((line, i) => (
                  <li key={i} className="text-[12.5px] leading-relaxed text-ink/90">
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[12px] text-mute-2">—</p>
            )}
          </div>
        ))}
      </div>
      {analysis.next_move && (
        <div className="border-t border-line bg-molten/[0.05] px-4 py-3.5">
          <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-molten">
            <ArrowRight size={12} aria-hidden /> Next move
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{analysis.next_move}</p>
          <p className="mt-2 text-[11.5px] text-mute-2">Answer your CMO below to sharpen this read →</p>
        </div>
      )}
    </div>
  );
}
