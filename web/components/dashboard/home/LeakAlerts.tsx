"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Siren } from "lucide-react";
import Panel from "../Panel";
import SlideOver from "../SlideOver";
import StatusChip from "../StatusChip";
import { formatINR } from "@/lib/format";
import type { LeakAlert } from "@/lib/mock/types";

/** The Watchdog layer: where money is draining right now. */
export default function LeakAlerts({ alerts, delay = 0 }: { alerts: LeakAlert[]; delay?: number }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const active = alerts.find((a) => a.id === openId) ?? null;

  return (
    <>
      <Panel eyebrow="Leak alerts" title="Where money is draining" delay={delay} className="h-full">
        <ul className="space-y-3">
          {alerts.map((a) => {
            const leaking = a.severity === "leaking";
            return (
              <li
                key={a.id}
                className={`rounded-xl border p-4 ${
                  leaking ? "border-bad/25 bg-bad/[0.06]" : "border-watch/25 bg-watch/[0.05]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="flex items-center gap-2 text-[13px] font-bold">
                    <Siren size={14} className={leaking ? "text-bad" : "text-watch"} aria-hidden />
                    {a.channel}
                  </p>
                  <StatusChip verdict={a.severity} />
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-ink/90">{a.summary}</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className={`font-mono text-sm font-semibold ${leaking ? "text-bad" : "text-watch"}`}>
                    {formatINR(a.monthlyWaste)}<span className="text-[11px] text-muted">/mo at risk</span>
                  </p>
                  <button
                    onClick={() => setOpenId(a.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-stroke-2 px-2.5 py-1.5 text-[12px] font-semibold text-ink transition-colors duration-200 hover:bg-white/5"
                  >
                    See why
                    <ArrowRight size={12} aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <SlideOver
        open={!!active}
        onClose={() => setOpenId(null)}
        eyebrow="Leak evidence"
        title={active ? `${active.channel} — ${formatINR(active.monthlyWaste)}/mo` : ""}
      >
        {active && (
          <div className="space-y-5">
            <p className="text-sm leading-relaxed">{active.summary}</p>
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                Why your CMO flagged it
              </h3>
              <ul className="space-y-2.5">
                {active.evidence.map((e) => (
                  <li key={e} className="flex gap-2.5 text-[13px] leading-relaxed text-ink/90">
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-bad/70" />
                    {e}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-stroke-2 bg-surface p-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                The fix
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed">{active.fix}</p>
              <Link
                href="/execute"
                className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-molten via-amber to-ember px-3.5 py-2 text-[12px] font-bold text-black transition-opacity duration-200 hover:opacity-90"
              >
                Open on the Execute board
                <ArrowRight size={13} aria-hidden />
              </Link>
            </div>
          </div>
        )}
      </SlideOver>
    </>
  );
}
