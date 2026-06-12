"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, CalendarClock, Check, Sparkles } from "lucide-react";
import type { ExecuteItem, MoveStatus } from "@/lib/mock/types";

const COLUMNS: { id: MoveStatus; title: string; hint: string }[] = [
  { id: "todo", title: "To do", hint: "approved by you, not started" },
  { id: "doing", title: "In progress", hint: "running — CMO is watching the metric" },
  { id: "done", title: "Done", hint: "verifying impact over 2 weeks" },
];

/** Advice → action: a simple board where every move is tied to the metric it should shift. */
export default function ExecuteBoard({ initial }: { initial: ExecuteItem[] }) {
  const [items, setItems] = useState(initial);
  const [scheduled, setScheduled] = useState<Record<string, boolean>>({});

  const move = (id: string, to: MoveStatus) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, status: to } : it)));

  return (
    <div className="grid items-start gap-4 md:grid-cols-3">
      {COLUMNS.map((colDef, ci) => {
        const colItems = items.filter((i) => i.status === colDef.id);
        return (
          <motion.section
            key={colDef.id}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: ci * 0.08 }}
            aria-label={colDef.title}
            className="rounded-2xl border border-stroke-2 bg-surface/60 p-3"
          >
            <header className="flex items-baseline justify-between px-1.5 pb-3 pt-1">
              <h2 className="text-[13px] font-bold tracking-tight">
                {colDef.title}
                <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 font-mono text-[11px] text-muted">
                  {colItems.length}
                </span>
              </h2>
              <p className="hidden text-[10px] text-muted xl:block">{colDef.hint}</p>
            </header>

            <ul className="space-y-2.5">
              {colItems.map((it) => (
                <li
                  key={it.id}
                  className={`rounded-xl border bg-surface p-4 ${
                    it.status === "done" ? "border-good/20" : "border-stroke-2"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className={`text-[13px] font-bold leading-snug ${it.status === "done" ? "text-muted" : ""}`}>
                      {it.title}
                    </h3>
                    {it.source === "cmo" && (
                      <span
                        title="Recommended by your CMO"
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber/25 bg-amber/10 px-2 py-0.5 text-[10px] font-bold text-amber"
                      >
                        <Sparkles size={9} aria-hidden /> CMO
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{it.detail}</p>
                  <p className="mt-2.5 rounded-lg bg-white/[0.03] px-2.5 py-1.5 font-mono text-[11px]">
                    <span className="text-muted">{it.metricLabel}: </span>
                    {it.metricNow}
                    <span className="text-muted"> → </span>
                    <span className={it.status === "done" ? "text-good" : "text-amber"}>{it.metricGoal}</span>
                  </p>
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
                    <CalendarClock size={11} aria-hidden />
                    {it.eta}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {it.status === "todo" && (
                      <>
                        <button
                          onClick={() => move(it.id, "doing")}
                          className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-molten via-amber to-ember px-3 py-1.5 text-[12px] font-bold text-black transition-opacity duration-200 hover:opacity-90"
                        >
                          Start
                          <ArrowRight size={12} aria-hidden />
                        </button>
                        <button
                          onClick={() => setScheduled((s) => ({ ...s, [it.id]: true }))}
                          disabled={scheduled[it.id]}
                          className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors duration-200 ${
                            scheduled[it.id]
                              ? "cursor-default border-good/25 text-good"
                              : "border-stroke-2 text-muted hover:bg-white/5 hover:text-ink"
                          }`}
                        >
                          {scheduled[it.id] ? "Scheduled — Mon 9:00" : "Approve & schedule"}
                        </button>
                      </>
                    )}
                    {it.status === "doing" && (
                      <button
                        onClick={() => move(it.id, "done")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-stroke-2 px-3 py-1.5 text-[12px] font-semibold transition-colors duration-200 hover:bg-white/5"
                      >
                        <Check size={12} aria-hidden />
                        Mark done
                      </button>
                    )}
                    {it.status === "done" && (
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-good">
                        <Check size={13} aria-hidden />
                        Done — verifying impact
                      </span>
                    )}
                  </div>
                </li>
              ))}
              {colItems.length === 0 && (
                <li className="rounded-xl border border-dashed border-stroke-2 p-5 text-center text-[12px] text-muted">
                  Nothing here.
                </li>
              )}
            </ul>
          </motion.section>
        );
      })}
    </div>
  );
}
