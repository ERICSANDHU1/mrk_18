"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import ThemeToggle from "@/components/app/ThemeToggle";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Check,
  FileSpreadsheet,
  Loader2,
  Lock,
  Upload,
  X,
} from "lucide-react";

/** The taster's second act — a free forensic audit of the founder's ad spend.
 *
 *  Deliberately NOT a fifth verdict card: the audit's schema is a full page
 *  (money summary, concentration, structural findings, reallocation, weekly
 *  actions), so cramming it into the 2x2 grid would wreck both. It opens as a
 *  full-screen canvas instead, leaving the instant four-card read untouched.
 *
 *  The browser posts the RAW CSV text straight to the backend — which parses it
 *  and does every calculation server-side, so the numbers shown here are
 *  computed, never model-invented. */

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000";
const MAX_BYTES = 10 * 1024 * 1024;

/** Recharts is heavy and only renders after an upload, so it must not sit in
 *  the bundle of a public marketing page that most visitors never upload on. */
const SpendTrend = dynamic(() => import("@/components/charts/AdCharts").then((m) => m.SpendTrend), {
  ssr: false,
});
const CampaignBars = dynamic(
  () => import("@/components/charts/AdCharts").then((m) => m.CampaignBars),
  { ssr: false },
);

type Finding = {
  severity: string;
  finding: string;
  evidence: string;
  root_cause: string;
  action: string;
  money_impact: string;
};
type Audit = {
  headline_verdict: string;
  money_summary: {
    total_spend: string;
    total_conversions: number | null;
    blended_cac: string | null;
    blended_roas: string | null;
    wasted_spend_estimate: string;
    wasted_spend_definition: string;
  };
  concentration: {
    summary: string;
    top_performer: { name: string; why: string };
    worst_offender: { name: string; why: string; spend: string };
  };
  structural_findings: Finding[];
  creative_signals: { fatigue_detected: boolean; evidence: string; recommendation: string };
  reallocation_plan: { from: string; to: string; amount: string; rationale: string }[];
  next_move: { action: string; why: string; impact: string };
  this_week: string[];
  data_quality: {
    rows_analyzed: number | null;
    missing_columns: string[];
    limitations: string;
    anomalies: string[];
  };
  confidence: string;
  pro_unlock: { headline: string; specific_gap: string };
};
/** Server-computed campaign rows + totals. These are arithmetic done in Python,
 *  not model output — so the charts are provably right even when the model's
 *  prose wobbles. */
type Campaign = {
  name: string;
  spend?: number;
  conversions?: number;
  impressions?: number;
  clicks?: number;
  ctr_pct?: number | null;
  cpc?: number | null;
  cac?: number | null;
  roas?: number | null;
};
type Computed = {
  currency: string | null;
  total_spend: number;
  total_conversions: number;
  blended_cac: number | null;
  blended_roas: number | null;
  blended_ctr_pct: number | null;
  worst_performing_count: number;
  worst_performing_names: string[];
  worst_performing_spend: number;
  worst_performing_spend_pct: number | null;
  worst_performing_conversions: number;
  worst_performing_conversion_pct: number | null;
};
type AuditResponse = {
  audit: Audit;
  computed: Computed;
  campaigns: Campaign[];
  /** Per-day totals for the trend line. Empty when the export had no date
   *  column — the chart hides itself rather than drawing a flat lie. */
  daily: { date: string; spend: number; clicks: number }[];
  currency: string | null;
  date_range: { from: string; to: string; days: number } | null;
  platform: string;
  row_count: number;
};

/** Money with the export's own currency. No currency column → plain grouped
 *  number rather than inventing a symbol. */
function money(n: number | null | undefined, cur?: string | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const rounded = Math.abs(n) >= 100 ? 0 : 2;
  if (!cur) return n.toLocaleString("en-IN", { maximumFractionDigits: rounded });
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: rounded,
    }).format(n);
  } catch {
    return `${cur} ${n.toLocaleString("en-IN", { maximumFractionDigits: rounded })}`;
  }
}

/** Server-render-safe "are we in the browser yet". A store that never emits, so
 *  it reads `false` through SSR and hydration, then `true` — no setState in an
 *  effect and no hydration mismatch. */
const neverChanges = () => () => {};
const useIsClient = () =>
  useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );

const num = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

/** Panel shell for the single-screen dashboard — same glass chrome as the
 *  charts, with a title, a one-line explanation, and a body that scrolls
 *  internally so the PAGE never does. */
function Panel({
  title,
  note,
  caption,
  children,
  className = "",
}: {
  title: string;
  note?: string;
  caption?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`glass flex min-h-0 min-w-0 flex-col rounded-2xl p-4 ${className}`}>
      <div className="flex shrink-0 items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{title}</p>
        {note && <span className="font-data text-[10px] text-mute-2">{note}</span>}
      </div>
      {caption && <p className="mt-0.5 shrink-0 text-[10.5px] leading-snug text-mute-2">{caption}</p>}
      <div className="dash-scroll mt-2 min-h-0 flex-1 overflow-y-auto pr-0.5">{children}</div>
    </div>
  );
}

/** The concentration gap, drawn. Two bars — share of spend vs share of results
 *  the worst campaigns produced. The gap between them IS the finding. */
function ConcentrationGap({ c }: { c: Computed }) {
  const spendPct = c.worst_performing_spend_pct;
  const convPct = c.worst_performing_conversion_pct;
  if (spendPct == null) return null;
  const gap = convPct == null ? null : Math.round((spendPct - convPct) * 10) / 10;
  const rows = [
    { label: "Share of spend", pct: spendPct, tone: "var(--bad)" },
    { label: "Share of results", pct: convPct ?? 0, tone: "var(--good)" },
  ];
  return (
    <>
      <p className="text-[12px] leading-snug text-ink">
        Your {c.worst_performing_count} worst campaign
        {c.worst_performing_count === 1 ? "" : "s"}
        {c.worst_performing_names.length > 0 && (
          <> — <span className="font-semibold">{c.worst_performing_names.join(", ")}</span></>
        )}
      </p>
      <div className="mt-3 space-y-2.5">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold text-ink">{r.label}</span>
              <span className="font-data text-[14px] font-extrabold text-ink">
                {r.pct.toFixed(1)}%
              </span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-[var(--track)]">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, Math.max(1.5, r.pct))}%`, background: r.tone }}
              />
            </div>
          </div>
        ))}
      </div>
      {gap != null && gap > 0 && (
        <p className="mt-2.5 text-[11px] leading-snug text-muted">
          They take <span className="font-bold text-bad">{gap} points</span> more of the budget than
          the results they return. That difference is the leak.
        </p>
      )}
    </>
  );
}

/** The four-chart read, same vocabulary as the paid dashboard. Every figure
 *  here is server-computed, so the charts cannot disagree with the verdict.
 *  Returns bare panels — the dashboard grid places them. */
function chartPanels({
  campaigns,
  daily,
  cur,
}: {
  campaigns: Campaign[];
  daily: { date: string; spend: number }[];
  cur: string | null;
}) {
  const byCost = campaigns.filter((c) => (c.spend ?? 0) > 0).slice(0, 7);
  if (byCost.length === 0) return null;
  const cacs = byCost.map((c) => c.cac).filter((v): v is number => typeof v === "number" && v > 0);
  const worst = cacs.length > 1 ? Math.max(...cacs) : null;
  const best = cacs.length > 1 ? Math.min(...cacs) : null;
  const tone = (c: Campaign) =>
    worst != null && c.cac === worst
      ? "var(--bad)"
      : best != null && c.cac === best
        ? "var(--good)"
        : undefined;

  // cost per result is the audit's metric; CPC only where the export lacks
  // conversions, so the fourth panel is never empty for a click-only export
  const hasCac = campaigns.some((c) => typeof c.cac === "number");
  const shell = "glass rounded-2xl p-4";
  const fmt = (n: number) => money(n, cur);
  const unit = cur ? "" : " (no currency column in this export)";

  return {
    // null, not an element: SpendTrend renders nothing without at least two
    // days, and a truthy-but-empty element would still claim a grid cell and
    // leave the hole this reflow exists to avoid
    trend: daily.length < 2 ? null : (
      <SpendTrend
        key="trend"
        data={daily}
        shell={shell}
        height="fill"
        className="min-h-0"
        note={`${daily.length}d`}
        caption={`Daily spend across the whole export${unit}. Spikes and cliffs are budget or delivery changes.`}
        formatValue={fmt}
      />
    ),
    spend: (
      <CampaignBars
        key="spend"
        rows={byCost.map((c) => ({ name: c.name, value: c.spend ?? null, tone: tone(c) }))}
        title="Where the money went"
        note={`top ${byCost.length}`}
        caption="Bar length is spend. Red is your worst cost per result, green your best — a long red bar is the problem."
        label="Spend"
        formatValue={fmt}
        shell={shell}
        height="fill"
        className="min-h-0"
        fade
      />
    ),
    ctr: (
      <CampaignBars
        key="ctr"
        rows={byCost.map((c) => ({ name: c.name, value: c.ctr_pct ?? null }))}
        title="CTR by campaign"
        note="%"
        caption="How many people click after seeing it. Low bars mean the creative or audience is not landing."
        label="CTR"
        formatValue={(n) => `${n}%`}
        color="var(--good)"
        shell={shell}
        height="fill"
        className="min-h-0"
      />
    ),
    cost: (
      <CampaignBars
        key="cost"
        rows={byCost.map((c) => ({
          name: c.name,
          value: hasCac ? (c.cac ?? null) : (c.cpc ?? null),
          tone: hasCac ? tone(c) : undefined,
        }))}
        title={hasCac ? "Cost per result" : "Cost per click"}
        note={cur || ""}
        caption={
          hasCac
            ? "What one conversion costs in each campaign. Here, shorter is better."
            : "What one click costs in each campaign. Shorter is better."
        }
        label={hasCac ? "Cost per result" : "CPC"}
        formatValue={fmt}
        color="var(--watch)"
        shell={shell}
        height="fill"
        className="min-h-0"
      />
    ),
  };
}

const SEVERITY: Record<string, { label: string; cls: string }> = {
  critical: { label: "critical", cls: "text-bad border-bad/40 bg-bad/10" },
  high: { label: "high", cls: "text-oxblood border-oxblood/40 bg-oxblood/10" },
  medium: { label: "medium", cls: "text-muted border-stroke bg-surface-2" },
};

const openWaitlist = () => window.dispatchEvent(new Event("mrk18:open-waitlist"));

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stroke bg-surface-2 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="font-data mt-0.5 text-[15px] font-extrabold text-ink">{value}</p>
    </div>
  );
}

export default function AdAudit({
  brandContext,
  variant = "panel",
  onGate,
}: {
  brandContext?: string;
  /** "card" sits in the verdict grid as the 4th cell; "panel" is the rail block. */
  variant?: "panel" | "card";
  /** When set, the CTA calls this instead of opening the audit inline — used on
   *  the public taster/studio to funnel the click into sign-up first. The real
   *  audit tool then lives in the app (Chief → Analytics interpreter). */
  onGate?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<AuditResponse | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // one entry point for every "open the audit" control — a gate short-circuits
  // it to sign-up on the anonymous pages, and opens it inline everywhere else.
  const openAudit = onGate ?? (() => setOpen(true));

  // The overlay is React state, so without this the browser Back button (and
  // the Android back gesture) would navigate the PAGE away — dumping the
  // founder on the landing page and losing their analysis. Opening pushes a
  // history entry so Back simply closes the overlay and returns them to their
  // verdicts. `pushed` tracks whether that entry is still ours to consume.
  const pushed = useRef(false);

  useEffect(() => {
    if (!open) return;
    window.history.pushState({ mrk18Audit: true }, "");
    pushed.current = true;
    const onPop = () => {
      pushed.current = false; // the browser already consumed our entry
      setOpen(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);

  /** Close from X / Escape. Goes back rather than just flipping state, so the
   *  history entry we pushed is consumed instead of left dangling (which would
   *  make the NEXT Back press appear to do nothing). */
  const close = () => {
    if (busy) return;
    if (pushed.current) window.history.back(); // → popstate → setOpen(false)
    else setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `close` is stable enough here; it only reads refs + busy
  }, [open, busy]);

  const run = async (file: File) => {
    setErr(null);
    if (!/\.csv$/i.test(file.name)) {
      setErr("That needs to be a .csv export from your ad platform.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setErr("That file is over 10MB — export a shorter date range.");
      return;
    }
    setFileName(file.name);
    setBusy(true);
    try {
      const csv = await file.text();
      const res = await fetch(`${BACKEND}/taster/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, brand_context: brandContext ?? "" }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.audit) {
        setData(body as AuditResponse);
      } else {
        setErr(
          typeof body?.detail === "string"
            ? body.detail
            : "We couldn't audit that file — try re-exporting it.",
        );
      }
    } catch {
      setErr("We couldn't reach the analysis engine — try again in a minute.");
    } finally {
      setBusy(false);
    }
  };

  const a = data?.audit;
  const comp = data?.computed;
  const cur = comp?.currency ?? null;
  // false on the server, true once hydrated — `document` does not exist during
  // SSR, and reading it during render would break hydration
  const portalTarget = useIsClient() ? document.body : null;
  const panels = data?.campaigns
    ? chartPanels({ campaigns: data.campaigns, daily: data.daily ?? [], cur })
    : null;

  return (
    <>
      {/* ── the 4th grid cell: the ad analyser, sized like a verdict card ──
          Empty state invites the upload; once audited it shows the headline +
          the money numbers, with the full report a click away (that report is
          a full page — it never belonged inside a card). */}
      {variant === "card" ? (
        <div className="glass flex min-h-0 flex-col overflow-y-auto rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-[13.5px] font-bold text-ink">Ad spend</h3>
              <p className="text-[10px] font-medium text-muted">
                where your money actually goes
              </p>
            </div>
            {a?.confidence && (
              <span className="shrink-0 rounded-md border border-stroke px-2 py-0.5 text-[10px] font-semibold uppercase text-muted">
                {a.confidence}
              </span>
            )}
          </div>

          {a ? (
            <>
              <p
                className="mt-2.5 text-[14.5px] font-semibold leading-snug text-ink"
                style={{ fontFamily: "var(--font-claude-serif), Georgia, serif" }}
              >
                {a.headline_verdict}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                <Stat label="Spend" value={a.money_summary.total_spend || "—"} />
                <Stat label="CAC" value={a.money_summary.blended_cac || "—"} />
                <Stat label="Wasted" value={a.money_summary.wasted_spend_estimate || "—"} />
              </div>
              {a.concentration.worst_offender.name && (
                <p className="mt-2.5 text-[12px] leading-relaxed text-muted">
                  <span className="font-semibold text-bad">Worst:</span>{" "}
                  {a.concentration.worst_offender.name} — {a.concentration.worst_offender.why}
                </p>
              )}
              <button
                onClick={openAudit}
                className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-molten transition-opacity hover:opacity-80"
              >
                View the full audit <ArrowRight size={13} aria-hidden />
              </button>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
              <span className="mb-2.5 grid h-9 w-9 place-items-center rounded-xl border border-stroke bg-surface-2 text-muted">
                <FileSpreadsheet size={16} aria-hidden />
              </span>
              <p className="text-[13px] font-bold text-ink">Running ads?</p>
              <p className="mt-1 max-w-[22ch] text-[11.5px] leading-relaxed text-muted">
                Drop your Meta or Google CSV — your CMO finds where the money leaks. Free.
              </p>
              <button
                onClick={openAudit}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-bold text-[color:var(--cta-ink,#0a0a0b)]"
                style={{ background: "var(--gradient-brand)" }}
              >
                <BarChart3 size={13} aria-hidden /> Audit my ad spend →
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="glass rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Free · act two
          </p>
          <p className="mt-1.5 text-[13px] font-bold leading-snug text-ink">
            Running ads? Get a forensic audit of your spend.
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            Drop your Meta or Google CSV export — your CMO finds where the money leaks. Still free.
          </p>
          <button
            onClick={openAudit}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-bold text-[color:var(--cta-ink,#0a0a0b)] shadow-[0_10px_36px_var(--cta-glow,rgba(255,106,0,0.35))] transition-shadow hover:shadow-[0_14px_48px_var(--cta-glow-strong,rgba(255,106,0,0.5))]"
            style={{ background: "var(--gradient-brand)" }}
          >
            <BarChart3 size={14} aria-hidden />
            {data ? "View your ad audit" : "Audit my ad spend →"}
          </button>
        </div>
      )}

      {/* Portalled to <body> on purpose. In card mode this component renders
          inside a Framer-Motion-animated cell, and an ancestor `transform`
          makes itself the containing block for `position: fixed` — so the
          "full-screen" canvas was silently boxed into the grid cell (346px of
          a 1280px viewport). Percentage-width bars stretched to fit and hid
          it; the charts, which need real pixels, did not. */}
      {portalTarget &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                // the dashboard is sized to the viewport at lg and never
                // scrolls there; below lg the panels stack and scrolling is the
                // only honest option on a phone
                className="theme-sand taster-scope fixed inset-0 z-[130] overflow-y-auto bg-[image:var(--taster-bg)]"
            role="dialog"
            aria-modal="true"
            aria-label="Ad performance audit"
          >
            {/* same hairline grid as the taster page, so the audit reads as
                part of the product rather than a bare modal */}
            <div aria-hidden className="pointer-events-none fixed inset-0">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--taster-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--taster-grid)_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
            </div>

            <div className="relative mx-auto flex w-full max-w-[1500px] flex-col px-4 py-3 sm:px-6 lg:h-[100dvh] lg:px-8 lg:py-4">
              <div className="flex shrink-0 items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
                    Ad performance audit {data ? `· ${data.platform} · ${data.row_count} rows` : ""}
                  </p>
                  <h2
                    className="mt-0.5 text-[clamp(1.25rem,2.2vw,1.6rem)] font-bold leading-tight text-ink"
                    style={{ fontFamily: "var(--font-claude-serif), Georgia, serif" }}
                  >
                    Where your ad money actually went
                  </h2>
                  {data?.date_range && (
                    <p className="mt-0.5 font-data text-[10.5px] text-mute-2">
                      {data.date_range.from} → {data.date_range.to} · {data.date_range.days} days
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ThemeToggle />
                  <button
                  onClick={close}
                  disabled={busy}
                  aria-label="Close audit"
                  className="shrink-0 rounded-lg border border-stroke p-2 text-muted transition-colors hover:text-ink disabled:opacity-40"
                >
                  <X size={16} aria-hidden />
                  </button>
                </div>
              </div>

              {/* ── upload ─────────────────────────────────────────────── */}
              {!a && (
                // the canvas is 1500px wide for the DASHBOARD; a drop zone that
                // wide strands its own label in the middle of an empty field
                <div className="mx-auto mt-8 w-full max-w-2xl">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f && !busy) run(f);
                    }}
                    className={`glass rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
                      dragging ? "border-molten/60" : "border-stroke-2"
                    }`}
                  >
                    <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-stroke bg-surface-2 text-muted">
                      {busy ? (
                        <Loader2 size={20} className="animate-spin" aria-hidden />
                      ) : (
                        <FileSpreadsheet size={20} aria-hidden />
                      )}
                    </span>
                    {busy ? (
                      <>
                        <p className="text-[15px] font-bold text-ink">Auditing {fileName}…</p>
                        <p className="mt-1 text-[12.5px] text-muted">
                          Reading every campaign, doing the maths, finding the leak.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-[15px] font-bold text-ink">
                          Drop your ad export here
                        </p>
                        <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-muted">
                          A .csv from Meta Ads Manager or Google Ads — include spend, impressions,
                          clicks and results. Nothing is stored; the file is analysed and dropped.
                        </p>
                        <button
                          onClick={() => inputRef.current?.click()}
                          className="mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold text-[color:var(--cta-ink,#0a0a0b)]"
                          style={{ background: "var(--gradient-brand)" }}
                        >
                          <Upload size={14} aria-hidden /> Choose CSV
                        </button>
                        <input
                          ref={inputRef}
                          type="file"
                          accept=".csv,text/csv"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) run(f);
                            e.target.value = "";
                          }}
                        />
                      </>
                    )}
                  </div>
                  {err && (
                    <p className="mt-4 flex items-start gap-2 text-[13px] font-medium text-bad">
                      <AlertTriangle size={15} className="mt-px shrink-0" aria-hidden />
                      {err}
                    </p>
                  )}
                </div>
              )}

              {/* ── the audit: one screen, no page scroll at lg ──────── */}
              {a && (
                <motion.div
                  initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 flex min-h-0 flex-1 flex-col gap-3"
                >
                  {/* verdict + the four numbers, on one line */}
                  <div className="glass shrink-0 rounded-2xl px-4 py-3">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <h3
                        className="max-w-3xl text-[clamp(0.95rem,1.5vw,1.2rem)] font-bold leading-snug text-ink"
                        style={{ fontFamily: "var(--font-claude-serif), Georgia, serif" }}
                      >
                        {a.headline_verdict}
                      </h3>
                      {/* tiles read from the SERVER-COMPUTED totals, not the
                          model's strings — always formatted, always right */}
                      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
                        <Stat label="Total spend" value={money(comp?.total_spend, cur)} />
                        <Stat label="Results" value={num(comp?.total_conversions)} />
                        <Stat label="Cost per result" value={money(comp?.blended_cac, cur)} />
                        <Stat label="At risk" value={money(comp?.worst_performing_spend, cur)} />
                      </div>
                    </div>
                    <p className="mt-2 text-[10.5px] leading-snug text-mute-2">
                      {a.money_summary.wasted_spend_definition
                        ? `At risk = ${a.money_summary.wasted_spend_definition}. `
                        : ""}
                      Every figure is computed from your file, not estimated.
                      {cur
                        ? ""
                        : " Your export has no currency column, so amounts are shown unitless."}
                    </p>
                  </div>

                  {/* THE top band: the one move, and the upgrade. Both above
                      the fold on every screen — the CTA used to sit at the
                      bottom of a panel that scrolled internally, so most
                      visitors never saw it. */}
                  <div className="grid shrink-0 gap-3 lg:grid-cols-3">
                    <div
                      className="rounded-2xl border border-molten/30 p-4 lg:col-span-2"
                      style={{ background: "var(--overlay-subtle, rgba(180,83,42,0.07))" }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-molten">
                          <ArrowRight size={12} aria-hidden /> Your next move
                        </p>
                        {a.next_move.impact && (
                          <span className="font-data rounded-md border border-molten/30 bg-molten/10 px-2 py-0.5 text-[11px] font-bold text-molten">
                            {a.next_move.impact}
                          </span>
                        )}
                      </div>
                      <p
                        className="mt-1.5 text-[clamp(1rem,1.7vw,1.35rem)] font-bold leading-snug text-ink"
                        style={{ fontFamily: "var(--font-claude-serif), Georgia, serif" }}
                      >
                        {a.next_move.action || "—"}
                      </p>
                      {a.next_move.why && (
                        <p className="mt-1 text-[12px] leading-snug text-muted">
                          {a.next_move.why}
                        </p>
                      )}
                    </div>

                    <div className="glass flex flex-col justify-center rounded-2xl p-4">
                      <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-molten">
                        <Lock size={11} aria-hidden /> {a.pro_unlock.headline || "The full CMO"}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-ink/85">
                        {a.pro_unlock.specific_gap}
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <button
                          onClick={openWaitlist}
                          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-bold text-[color:var(--cta-ink,#0a0a0b)]"
                          style={{ background: "var(--gradient-brand)" }}
                        >
                          <Check size={13} aria-hidden /> Unlock the full CMO
                        </button>
                        <button
                          onClick={() => {
                            setData(null);
                            setErr(null);
                          }}
                          className="text-[11px] font-semibold text-muted transition-colors hover:text-ink"
                        >
                          Audit another
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* the fold: the verdict and the two panels that carry it,
                      sized to whatever the viewport has left */}
                  <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12">
                    {panels?.trend && (
                      <div className="flex min-h-[220px] flex-col lg:col-span-4 lg:min-h-0">
                        {panels.trend}
                      </div>
                    )}
                    {panels && (
                      <div
                        className={`flex min-h-[220px] flex-col lg:min-h-0 ${
                          panels.trend ? "lg:col-span-4" : "lg:col-span-6"
                        }`}
                      >
                        {panels.spend}
                      </div>
                    )}

                    {comp && (
                      <Panel
                        title="The gap that costs you money"
                        caption="Spend share against results share for your worst campaigns."
                        className={panels?.trend ? "lg:col-span-4" : "lg:col-span-6"}
                      >
                        <ConcentrationGap c={comp} />
                        {(a.concentration.top_performer.name ||
                          a.concentration.worst_offender.name) && (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <div className="rounded-lg border border-good/30 bg-good/[0.07] p-2.5">
                              <p className="text-[9.5px] font-bold uppercase tracking-wide text-good">
                                Best
                              </p>
                              <p className="mt-0.5 text-[12px] font-bold leading-snug text-ink">
                                {a.concentration.top_performer.name || "—"}
                              </p>
                              <p className="text-[10.5px] leading-snug text-muted">
                                {a.concentration.top_performer.why}
                              </p>
                            </div>
                            <div className="rounded-lg border border-bad/30 bg-bad/[0.07] p-2.5">
                              <p className="text-[9.5px] font-bold uppercase tracking-wide text-bad">
                                Worst
                              </p>
                              <p className="mt-0.5 text-[12px] font-bold leading-snug text-ink">
                                {a.concentration.worst_offender.name || "—"}
                              </p>
                              <p className="text-[10.5px] leading-snug text-muted">
                                {a.concentration.worst_offender.why}
                              </p>
                            </div>
                          </div>
                        )}
                      </Panel>
                    )}
                  </div>
                </motion.div>
              )}
            </div>

            {/* below the fold — the detail, in normal flow. Panels get room to
                breathe here instead of being squeezed into the first screen. */}
            {a && (
              <div className="relative mx-auto w-full max-w-[1500px] px-4 pb-10 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
                  {panels && (
                    <>
                      <div className="flex h-[320px] flex-col lg:col-span-3">{panels.ctr}</div>
                      <div className="flex h-[320px] flex-col lg:col-span-3">{panels.cost}</div>
                    </>
                  )}

                    <Panel
                      title="What is structurally wrong"
                      note={String(a.structural_findings.length)}
                      caption="The mechanics behind the numbers, worst first."
                      className="h-[320px] lg:col-span-3"
                    >
                      <ol className="space-y-2">
                        {a.structural_findings.map((f, i) => {
                          const sev = SEVERITY[f.severity] ?? SEVERITY.medium;
                          return (
                            <li key={i} className="rounded-lg border border-stroke bg-surface p-2.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`rounded border px-1.5 py-px text-[9px] font-bold uppercase tracking-wide ${sev.cls}`}
                                >
                                  {sev.label}
                                </span>
                                {f.money_impact && (
                                  <span className="font-data text-[10.5px] font-bold text-molten">
                                    {f.money_impact}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1.5 text-[12px] font-semibold leading-snug text-ink">
                                {f.finding}
                              </p>
                              {f.evidence && (
                                <p className="mt-1 text-[10.5px] leading-snug text-muted">
                                  <span className="font-semibold">Evidence:</span> {f.evidence}
                                </p>
                              )}
                              {f.action && (
                                <p className="mt-1.5 flex gap-1.5 text-[11px] font-medium leading-snug text-ink">
                                  <ArrowRight
                                    size={12}
                                    className="mt-0.5 shrink-0 text-molten"
                                    aria-hidden
                                  />
                                  {f.action}
                                </p>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    </Panel>

                    <Panel
                      title="Do this week"
                      caption="The moves, in order. Then the money to shift."
                      className="h-[320px] lg:col-span-3"
                    >
                      <ol className="space-y-1.5">
                        {a.this_week.map((t, i) => (
                          <li key={i} className="flex gap-2">
                            <span
                              className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold text-[color:var(--cta-ink,#fff)]"
                              style={{ background: "var(--gradient-brand)" }}
                            >
                              {i + 1}
                            </span>
                            <span className="text-[11.5px] font-medium leading-snug text-ink">
                              {t}
                            </span>
                          </li>
                        ))}
                      </ol>

                      {a.reallocation_plan.length > 0 && (
                        <>
                          <p className="mt-3 text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted">
                            Move the money
                          </p>
                          <ul className="mt-1.5 space-y-1.5">
                            {a.reallocation_plan.map((pl, i) => (
                              <li
                                key={i}
                                className="rounded-lg border border-stroke bg-surface px-2.5 py-1.5"
                              >
                                <p className="text-[11px] font-semibold leading-snug text-ink">
                                  {pl.from} <span className="text-molten">→</span> {pl.to}{" "}
                                  <span className="font-data font-extrabold">{pl.amount}</span>
                                </p>
                                <p className="text-[10px] leading-snug text-muted">{pl.rationale}</p>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}

                      <p className="mt-3 text-[10px] leading-snug text-mute-2">
                        <span className="font-semibold">Not visible in this file:</span>{" "}
                        {a.data_quality.limitations || "—"}
                        {a.data_quality.missing_columns.length > 0 && (
                          <> Missing: {a.data_quality.missing_columns.join(", ")}.</>
                        )}{" "}
                        Confidence: {a.confidence}.
                      </p>

                    </Panel>
                  </div>
                </div>
              )}
              </motion.div>
            )}
          </AnimatePresence>,
          portalTarget,
        )}
    </>
  );
}
