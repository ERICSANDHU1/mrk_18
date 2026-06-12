"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Check, FileText, Square, TrendingUp, Volume2 } from "lucide-react";
import Panel from "../Panel";
import Takeaway from "../Takeaway";
import ChartTip from "../charts/ChartTip";
import { formatCompactINR } from "@/lib/format";
import type { ReportSection, WeeklyReport } from "@/lib/mock/types";

const SECTION_COLOR: Record<ReportSection["kind"], { bar: string; chip: string; rail: string }> = {
  worked: { bar: "var(--good)", chip: "text-good bg-good/10 border-good/25", rail: "bg-good" },
  leaking: { bar: "var(--bad)", chip: "text-bad bg-bad/10 border-bad/25", rail: "bg-bad" },
  next: { bar: "var(--amber)", chip: "text-amber bg-amber/10 border-amber/25", rail: "bg-amber" },
};

/** The weekly bitter-truth report: a document with proof, not a wall of charts. */
export default function ReportView({ reports }: { reports: WeeklyReport[] }) {
  const [selectedId, setSelectedId] = useState(reports[0].id);
  const [reviewed, setReviewed] = useState<Record<string, boolean>>(
    Object.fromEntries(reports.map((r) => [r.id, r.reviewed])),
  );
  const [speaking, setSpeaking] = useState(false);
  const report = reports.find((r) => r.id === selectedId) ?? reports[0];

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const toggleListen = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const text = [
      `Weekly report, ${report.week}.`,
      report.verdict,
      ...report.sections.map((s) => `${s.title}. ${s.body.join(" ")}`),
    ].join(" ");
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.04;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.speak(u);
    setSpeaking(true);
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_280px]">
      {/* the document */}
      <Panel delay={1} className="!p-0">
        <header className="border-b border-stroke-2 p-6 sm:p-7">
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
              Weekly report · {report.week}
            </p>
            <span className="rounded-full border border-stroke-2 bg-surface-2 px-2.5 py-0.5 text-[11px] font-semibold capitalize text-ink">
              {report.confidence} confidence
            </span>
            {reviewed[report.id] && (
              <span className="inline-flex items-center gap-1 rounded-full border border-good/25 bg-good/10 px-2.5 py-0.5 text-[11px] font-semibold text-good">
                <Check size={11} aria-hidden /> Reviewed
              </span>
            )}
          </div>
          <h2 className="mt-2.5 text-xl font-extrabold leading-snug tracking-tight sm:text-2xl">
            {report.verdict}
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={toggleListen}
              aria-pressed={speaking}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-molten via-amber to-ember px-3.5 py-2 text-[12px] font-bold text-black transition-opacity duration-200 hover:opacity-90"
            >
              {speaking ? <Square size={12} aria-hidden /> : <Volume2 size={13} aria-hidden />}
              {speaking ? "Stop" : "Listen to the summary"}
            </button>
            <button
              onClick={() => setReviewed((r) => ({ ...r, [report.id]: !r[report.id] }))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stroke-2 px-3.5 py-2 text-[12px] font-semibold text-ink transition-colors duration-200 hover:bg-white/5"
            >
              <Check size={13} aria-hidden />
              {reviewed[report.id] ? "Mark unreviewed" : "Mark reviewed"}
            </button>
          </div>
        </header>

        {report.sections.length === 0 ? (
          <div className="p-6 sm:p-7">
            <p className="text-[13px] leading-relaxed text-muted">
              Full report archived. The verdict above is what mattered — open the latest report for
              live sections, or ask your CMO to restore this one.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[rgba(255,255,255,0.07)]">
            {report.sections.map((s) => {
              const c = SECTION_COLOR[s.kind];
              return (
                <section key={s.kind} className="relative p-6 sm:p-7">
                  <span aria-hidden className={`absolute left-0 top-7 h-10 w-0.5 rounded-r ${c.rail}`} />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
                      {s.kind === "worked" ? (
                        <TrendingUp size={15} className="text-good" aria-hidden />
                      ) : s.kind === "leaking" ? (
                        <FileText size={15} className="text-bad" aria-hidden />
                      ) : (
                        <Check size={15} className="text-amber" aria-hidden />
                      )}
                      {s.title}
                    </h3>
                    <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold ${c.chip}`}>
                      {s.metricLabel}: {s.metricValue}
                    </span>
                  </div>
                  <div className="mt-3 max-w-prose space-y-3">
                    {s.body.map((p) => (
                      <p key={p.slice(0, 24)} className="text-[14px] leading-relaxed text-ink/90">
                        {p}
                      </p>
                    ))}
                  </div>
                  <div className="mt-5 max-w-md">
                    <Takeaway>{s.chartTakeaway}</Takeaway>
                    <figure role="img" aria-label={s.chartTakeaway} className="m-0">
                      <ResponsiveContainer width="100%" height={120}>
                        <BarChart data={s.chart} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                          <XAxis
                            dataKey="label"
                            tick={{ fill: "var(--muted)", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                          />
                          <Tooltip
                            content={
                              <ChartTip
                                format={(v) => (s.kind === "worked" ? String(v) : formatCompactINR(v))}
                              />
                            }
                            cursor={{ fill: "rgba(255,255,255,0.04)" }}
                          />
                          <Bar name={s.metricLabel} dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={40}>
                            {s.chart.map((entry) => (
                              <Cell key={entry.label} fill={c.bar} fillOpacity={0.75} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </figure>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </Panel>

      {/* past reports rail */}
      <Panel eyebrow="Past reports" delay={2} className="lg:sticky lg:top-[72px]">
        <ul className="space-y-1.5">
          {reports.map((r) => {
            const activeReport = r.id === selectedId;
            return (
              <li key={r.id}>
                <button
                  onClick={() => setSelectedId(r.id)}
                  aria-current={activeReport ? "true" : undefined}
                  className={`w-full rounded-xl border p-3 text-left transition-colors duration-200 ${
                    activeReport
                      ? "border-amber/30 bg-amber/[0.05]"
                      : "border-stroke-2 hover:bg-white/[0.03]"
                  }`}
                >
                  <p className="flex items-center justify-between gap-2 font-mono text-[11px] text-muted">
                    {r.week}
                    {reviewed[r.id] && <Check size={12} className="text-good" aria-hidden />}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[12px] font-semibold leading-snug">{r.verdict}</p>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
