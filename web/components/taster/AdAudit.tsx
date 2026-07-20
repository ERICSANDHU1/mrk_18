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
type AuditResponse = { audit: Audit; platform: string; row_count: number };

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

export default function AdAudit({ brandContext }: { brandContext?: string }) {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<AuditResponse | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  return (
    <>
      {/* the invitation — sits with the free verdicts, before the paid gate */}
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
            <div className="mx-auto w-full max-w-4xl px-6 py-10">
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
                  onClick={() => !busy && setOpen(false)}
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
                    <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
                      <Stat label="Total spend" value={a.money_summary.total_spend || "—"} />
                      <Stat
                        label="Conversions"
                        value={
                          a.money_summary.total_conversions != null
                            ? String(a.money_summary.total_conversions)
                            : "—"
                        }
                      />
                      <Stat label="Blended CAC" value={a.money_summary.blended_cac || "—"} />
                      <Stat
                        label="Wasted spend"
                        value={a.money_summary.wasted_spend_estimate || "—"}
                      />
                    </div>
                    {a.money_summary.wasted_spend_definition && (
                      <p className="mt-2.5 text-[11.5px] text-muted">
                        Wasted = {a.money_summary.wasted_spend_definition}
                      </p>
                    )}
                  </div>

                  {/* concentration */}
                  {a.concentration.summary && (
                    <div className="glass rounded-2xl p-6">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                        Where the money concentrated
                      </p>
                      <p className="mt-2 text-[15px] font-semibold leading-snug text-ink">
                        {a.concentration.summary}
                      </p>
                      <div className="mt-4 grid gap-2.5 md:grid-cols-2">
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
