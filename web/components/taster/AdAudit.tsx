"use client";

import { useEffect, useRef, useState } from "react";
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

const num = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

/** The concentration gap, drawn. Two bars — share of spend vs share of results
 *  the worst campaigns produced. The gap between them IS the finding. */
function ConcentrationGap({ c }: { c: Computed }) {
  const spendPct = c.worst_performing_spend_pct;
  const convPct = c.worst_performing_conversion_pct;
  if (spendPct == null) return null;
  const rows = [
    { label: "of your spend", pct: spendPct, tone: "var(--bad, #b3261e)" },
    { label: "of your results", pct: convPct ?? 0, tone: "var(--good, #2e7d32)" },
  ];
  return (
    <div className="glass rounded-2xl p-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
        The gap that costs you money
      </p>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink">
        Your {c.worst_performing_count} worst campaign
        {c.worst_performing_count === 1 ? "" : "s"}
        {c.worst_performing_names.length > 0 && (
          <> (<span className="font-semibold">{c.worst_performing_names.join(", ")}</span>)</>
        )}{" "}
        took this much of the budget, and gave back this much:
      </p>
      <div className="mt-4 space-y-3">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] font-semibold text-ink">{r.label}</span>
              <span className="font-data text-[15px] font-extrabold text-ink">
                {r.pct.toFixed(1)}%
              </span>
            </div>
            <div className="mt-1 h-3 overflow-hidden rounded-full bg-[#1b1815]/10">
              <div
                className="h-full rounded-full transition-[width] duration-700"
                style={{ width: `${Math.min(100, Math.max(1.5, r.pct))}%`, background: r.tone }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Spend per campaign, bar-charted and coloured by efficiency: the widest bar
 *  in red is where the money is going and not coming back. */
function CampaignChart({ campaigns, cur }: { campaigns: Campaign[]; cur: string | null }) {
  const rows = campaigns.filter((c) => (c.spend ?? 0) > 0).slice(0, 8);
  if (rows.length === 0) return null;
  const maxSpend = Math.max(...rows.map((c) => c.spend ?? 0));
  const cacs = rows.map((c) => c.cac).filter((v): v is number => typeof v === "number" && v > 0);
  const worstCac = cacs.length > 1 ? Math.max(...cacs) : null;
  const bestCac = cacs.length > 1 ? Math.min(...cacs) : null;

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
          Where the money went
        </p>
        <p className="text-[10.5px] text-muted">
          bar = spend · <span className="font-semibold text-bad">red</span> = worst cost per
          result · <span className="font-semibold text-good">green</span> = best
        </p>
      </div>
      <ul className="mt-4 space-y-3.5">
        {rows.map((c) => {
          const pct = maxSpend ? ((c.spend ?? 0) / maxSpend) * 100 : 0;
          const isWorst = worstCac != null && c.cac === worstCac;
          const isBest = bestCac != null && c.cac === bestCac;
          const bg = isWorst
            ? "var(--bad, #b3261e)"
            : isBest
              ? "var(--good, #2e7d32)"
              : "var(--gradient-brand)";
          return (
            <li key={c.name}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="truncate text-[12.5px] font-semibold text-ink">{c.name}</span>
                <span className="font-data shrink-0 text-[11.5px] text-muted">
                  {money(c.spend, cur)}
                  {typeof c.cac === "number" && (
                    <>
                      {" · "}
                      <span
                        className={
                          isWorst ? "font-bold text-bad" : isBest ? "font-bold text-good" : ""
                        }
                      >
                        {money(c.cac, cur)}/result
                      </span>
                    </>
                  )}
                </span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-[#1b1815]/10">
                <div
                  className="h-full rounded-full transition-[width] duration-700"
                  style={{ width: `${Math.max(2, pct)}%`, background: bg }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
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
}: {
  brandContext?: string;
  /** "card" sits in the verdict grid as the 4th cell; "panel" is the rail block. */
  variant?: "panel" | "card";
}) {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<AuditResponse | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
                onClick={() => setOpen(true)}
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
                onClick={() => setOpen(true)}
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
            onClick={() => setOpen(true)}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-bold text-[color:var(--cta-ink,#0a0a0b)] shadow-[0_10px_36px_var(--cta-glow,rgba(255,106,0,0.35))] transition-shadow hover:shadow-[0_14px_48px_var(--cta-glow-strong,rgba(255,106,0,0.5))]"
            style={{ background: "var(--gradient-brand)" }}
          >
            <BarChart3 size={14} aria-hidden />
            {data ? "View your ad audit" : "Audit my ad spend →"}
          </button>
        </div>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] overflow-y-auto bg-[linear-gradient(105deg,#d3ccbb_0%,#dcd6c6_50%,#e5dfd1_100%)]"
            role="dialog"
            aria-modal="true"
            aria-label="Ad performance audit"
          >
            {/* same hairline grid as the taster page, so the audit reads as
                part of the product rather than a bare modal */}
            <div aria-hidden className="pointer-events-none fixed inset-0">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
            </div>

            <div className="relative mx-auto w-full max-w-4xl px-6 py-10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
                    Ad performance audit {data ? `· ${data.platform} · ${data.row_count} rows` : ""}
                  </p>
                  <h2
                    className="mt-1 text-[clamp(1.5rem,3vw,2rem)] font-bold leading-tight text-ink"
                    style={{ fontFamily: "var(--font-claude-serif), Georgia, serif" }}
                  >
                    Where your ad money actually went
                  </h2>
                </div>
                <button
                  onClick={close}
                  disabled={busy}
                  aria-label="Close audit"
                  className="shrink-0 rounded-lg border border-stroke p-2 text-muted transition-colors hover:text-ink disabled:opacity-40"
                >
                  <X size={16} aria-hidden />
                </button>
              </div>

              {/* ── upload ─────────────────────────────────────────────── */}
              {!a && (
                <div className="mt-8">
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

              {/* ── the audit ──────────────────────────────────────────── */}
              {a && (
                <motion.div
                  initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-8 space-y-4"
                >
                  {/* headline + money */}
                  <div className="glass rounded-2xl p-6">
                    <h3
                      className="text-[clamp(1.15rem,2.4vw,1.6rem)] font-bold leading-snug text-ink"
                      style={{ fontFamily: "var(--font-claude-serif), Georgia, serif" }}
                    >
                      {a.headline_verdict}
                    </h3>
                    {/* tiles read from the SERVER-COMPUTED totals, not the
                        model's strings — so they're always formatted and always
                        arithmetically right */}
                    <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
                      <Stat label="Total spend" value={money(comp?.total_spend, cur)} />
                      <Stat label="Results" value={num(comp?.total_conversions)} />
                      <Stat label="Cost per result" value={money(comp?.blended_cac, cur)} />
                      <Stat
                        label="At risk"
                        value={money(comp?.worst_performing_spend, cur)}
                      />
                    </div>
                    {a.money_summary.wasted_spend_definition && (
                      <p className="mt-2.5 text-[11.5px] text-muted">
                        Wasted = {a.money_summary.wasted_spend_definition}
                      </p>
                    )}
                  </div>

                  {/* THE picture: spend per campaign, coloured by efficiency */}
                  {data?.campaigns && <CampaignChart campaigns={data.campaigns} cur={cur} />}

                  {/* the spend-vs-results gap, drawn from computed numbers.
                      Deliberately NOT the model's concentration sentence — that
                      prose occasionally names a campaign not in the file; these
                      bars come straight from the arithmetic. */}
                  {comp && <ConcentrationGap c={comp} />}

                  {/* best / worst callouts */}
                  {(a.concentration.top_performer.name || a.concentration.worst_offender.name) && (
                    <div className="glass rounded-2xl p-6">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                        Best and worst
                      </p>
                      <div className="mt-3 grid gap-2.5 md:grid-cols-2">
                        <div className="rounded-xl border border-good/30 bg-good/[0.07] p-3.5">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-good">
                            Best performer
                          </p>
                          <p className="mt-1 text-[13.5px] font-bold text-ink">
                            {a.concentration.top_performer.name || "—"}
                          </p>
                          <p className="text-[12px] text-muted">
                            {a.concentration.top_performer.why}
                          </p>
                        </div>
                        <div className="rounded-xl border border-bad/30 bg-bad/[0.07] p-3.5">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-bad">
                            Worst offender
                          </p>
                          <p className="mt-1 text-[13.5px] font-bold text-ink">
                            {a.concentration.worst_offender.name || "—"}{" "}
                            <span className="font-data text-[12px] font-semibold text-muted">
                              {a.concentration.worst_offender.spend}
                            </span>
                          </p>
                          <p className="text-[12px] text-muted">
                            {a.concentration.worst_offender.why}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* structural findings */}
                  <div className="glass rounded-2xl p-6">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                      What&apos;s structurally wrong
                    </p>
                    <ol className="mt-3 space-y-3.5">
                      {a.structural_findings.map((f, i) => {
                        const sev = SEVERITY[f.severity] ?? SEVERITY.medium;
                        return (
                          <li key={i} className="rounded-xl border border-stroke bg-surface p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${sev.cls}`}
                              >
                                {sev.label}
                              </span>
                              {f.money_impact && (
                                <span className="font-data text-[11.5px] font-bold text-molten">
                                  {f.money_impact}
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-[14px] font-semibold leading-snug text-ink">
                              {f.finding}
                            </p>
                            {f.evidence && (
                              <p className="mt-1.5 text-[12px] text-muted">
                                <span className="font-semibold">Evidence:</span> {f.evidence}
                              </p>
                            )}
                            {f.root_cause && (
                              <p className="mt-1 text-[12px] text-muted">
                                <span className="font-semibold">Root cause:</span> {f.root_cause}
                              </p>
                            )}
                            {f.action && (
                              <p className="mt-2.5 flex gap-2 text-[12.5px] font-medium leading-relaxed text-ink">
                                <ArrowRight
                                  size={14}
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
                  </div>

                  {/* reallocation + this week */}
                  <div className="grid gap-4 md:grid-cols-2">
                    {a.reallocation_plan.length > 0 && (
                      <div className="glass rounded-2xl p-6">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                          Move the money
                        </p>
                        <ul className="mt-3 space-y-2.5">
                          {a.reallocation_plan.map((p, i) => (
                            <li key={i} className="rounded-xl border border-stroke bg-surface p-3">
                              <p className="text-[12.5px] font-semibold text-ink">
                                {p.from} <span className="text-molten">→</span> {p.to}
                              </p>
                              <p className="font-data text-[13px] font-extrabold text-ink">
                                {p.amount}
                              </p>
                              <p className="text-[11.5px] text-muted">{p.rationale}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {a.this_week.length > 0 && (
                      <div className="glass rounded-2xl p-6">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                          Do this week
                        </p>
                        <ol className="mt-3 space-y-2.5">
                          {a.this_week.map((t, i) => (
                            <li key={i} className="flex gap-2.5">
                              <span
                                className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-[color:var(--cta-ink,#fff)]"
                                style={{ background: "var(--gradient-brand)" }}
                              >
                                {i + 1}
                              </span>
                              <span className="text-[12.5px] font-medium leading-snug text-ink">
                                {t}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>

                  {/* honesty block — what this audit could NOT see */}
                  <div className="rounded-2xl border border-stroke bg-surface/60 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                      What this audit could not see
                    </p>
                    <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                      {a.data_quality.limitations || "—"}
                      {a.data_quality.missing_columns.length > 0 && (
                        <>
                          {" "}
                          Missing columns:{" "}
                          <span className="font-semibold">
                            {a.data_quality.missing_columns.join(", ")}
                          </span>
                          .
                        </>
                      )}{" "}
                      Confidence:{" "}
                      <span className="font-semibold text-ink">{a.confidence}</span>.
                    </p>
                    {a.creative_signals.evidence && (
                      <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                        <span className="font-semibold">Creative fatigue:</span>{" "}
                        {a.creative_signals.fatigue_detected ? "detected — " : "not detected — "}
                        {a.creative_signals.evidence}
                      </p>
                    )}
                  </div>

                  {/* the gate — a REAL limitation of one snapshot, never a fake wall */}
                  <div className="glass rounded-2xl p-6">
                    <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-molten">
                      <Lock size={12} aria-hidden /> {a.pro_unlock.headline || "The full CMO"}
                    </p>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-ink/90">
                      {a.pro_unlock.specific_gap}
                    </p>
                    <button
                      onClick={openWaitlist}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold text-[color:var(--cta-ink,#0a0a0b)]"
                      style={{ background: "var(--gradient-brand)" }}
                    >
                      <Check size={14} aria-hidden /> Unlock the full CMO →
                    </button>
                  </div>

                  <div className="flex justify-center pb-4">
                    <button
                      onClick={() => {
                        setData(null);
                        setErr(null);
                      }}
                      className="text-[12.5px] font-semibold text-muted transition-colors hover:text-ink"
                    >
                      Audit another export
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
