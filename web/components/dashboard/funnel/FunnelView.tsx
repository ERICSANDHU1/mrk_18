"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import SlideOver from "../SlideOver";
import StatusChip from "../StatusChip";
import { formatNum } from "@/lib/format";
import type { FunnelStage, Verdict } from "@/lib/mock/types";

const JOINT_COLOR: Record<Verdict, string> = {
  healthy: "text-muted",
  watch: "text-watch",
  leaking: "text-bad",
};

/** Descending funnel with red drips at the leaky joints. Stages click into evidence. */
export default function FunnelView({ stages }: { stages: FunnelStage[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const active = stages.find((s) => s.id === openId) ?? null;
  const max = stages[0].count;
  // sub-linear scale keeps late stages visible (linear would render 268 of 48,200 invisible)
  const widthPct = (count: number) => Math.round(Math.pow(count / max, 0.25) * 100);

  return (
    <>
      <ol className="mx-auto max-w-3xl">
        {stages.map((stage, i) => {
          const w = widthPct(stage.count);
          const next = stages[i + 1];
          const nextW = next ? widthPct(next.count) : Math.max(10, w - 6);
          // taper the block so its bottom edge meets the next stage's width
          const inset = Math.max(0, ((1 - nextW / w) / 2) * 100);
          const jointVerdict: Verdict = next ? next.verdict : "healthy";
          const showDrips = stage.leak !== null && jointVerdict !== "healthy";

          return (
            <li key={stage.id}>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: i * 0.09 }}
                className="flex justify-center"
              >
                <button
                  onClick={() => setOpenId(stage.id)}
                  aria-haspopup="dialog"
                  aria-label={`${stage.name}: ${formatNum(stage.count)}${
                    stage.convFromPrev !== null ? `, ${stage.convFromPrev}% from previous stage` : ""
                  }. Open details.`}
                  style={{
                    width: `${w}%`,
                    clipPath: `polygon(0 0, 100% 0, ${100 - inset}% 100%, ${inset}% 100%)`,
                  }}
                  className="group relative min-w-[220px] border border-stroke-2 bg-surface px-5 py-4 text-left transition-colors duration-200 hover:bg-surface-2 focus-visible:bg-surface-2"
                >
                  <div className="mx-auto flex max-w-md items-center justify-between gap-3">
                    <div>
                      <p className="text-[12px] font-semibold text-muted">{stage.name}</p>
                      <p className="font-mono text-xl font-semibold tracking-tight sm:text-2xl">
                        {formatNum(stage.count)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {stage.convFromPrev !== null && (
                        <span className="rounded-full border border-stroke-2 bg-bg/50 px-2 py-0.5 font-mono text-[11px] text-muted">
                          {stage.convFromPrev}%
                        </span>
                      )}
                      <StatusChip verdict={stage.verdict} />
                    </div>
                  </div>
                </button>
              </motion.div>

              {/* the joint: where customers go missing */}
              {stage.leak && (
                <div className="relative mx-auto flex max-w-md items-center justify-center gap-3 py-3">
                  {showDrips && (
                    <span aria-hidden className="flex gap-1.5">
                      {[0, 1, 2].map((d) => (
                        <span
                          key={d}
                          className={`drip h-1.5 w-1 rounded-full ${
                            jointVerdict === "leaking" ? "bg-bad" : "bg-watch"
                          }`}
                          style={{ animationDelay: `${d * 0.45}s` }}
                        />
                      ))}
                    </span>
                  )}
                  <p className={`max-w-sm text-center text-[12px] leading-snug ${JOINT_COLOR[jointVerdict]}`}>
                    {stage.leak}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <SlideOver
        open={!!active}
        onClose={() => setOpenId(null)}
        eyebrow="Funnel stage"
        title={active ? `${active.name} — ${formatNum(active.count)}` : ""}
      >
        {active && (
          <div className="space-y-5">
            <div className="flex items-center gap-2.5">
              <StatusChip verdict={active.verdict} />
              {active.convFromPrev !== null && (
                <span className="font-mono text-[12px] text-muted">
                  {active.convFromPrev}% conversion from previous stage
                </span>
              )}
            </div>
            <p className="text-sm leading-relaxed">{active.detail.takeaway}</p>
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                Evidence
              </h3>
              <ul className="space-y-2.5">
                {active.detail.evidence.map((e) => (
                  <li key={e} className="flex gap-2.5 text-[13px] leading-relaxed text-ink/90">
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber/70" />
                    {e}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-stroke-2 bg-surface p-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                {active.verdict === "healthy" ? "Verdict" : "The fix"}
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed">{active.detail.fix}</p>
              {active.verdict !== "healthy" && (
                <Link
                  href="/console"
                  className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg bg-molten px-3.5 py-2 text-[12px] font-bold text-white transition-opacity duration-200 hover:opacity-90"
                >
                  Open on the Execute board
                  <ArrowRight size={13} aria-hidden />
                </Link>
              )}
            </div>
          </div>
        )}
      </SlideOver>
    </>
  );
}
