"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import Panel from "../Panel";
import type { NextMove } from "@/lib/mock/types";

/** The Advise layer: 3 orange-accented moves, each backed by its metric. */
export default function NextMoves({ moves, delay = 0 }: { moves: NextMove[]; delay?: number }) {
  const [done, setDone] = useState<Record<string, boolean>>({});

  return (
    <Panel
      eyebrow="Your next move"
      title="Three moves, ranked by money recovered"
      delay={delay}
      className="h-full"
    >
      <ul className="grid gap-3 sm:grid-cols-3">
        {moves.map((m) => {
          const isDone = !!done[m.id];
          return (
            <li
              key={m.id}
              className={`relative flex flex-col rounded-xl border p-4 transition-all duration-300 ${
                isDone
                  ? "border-good/25 bg-good/5"
                  : "border-amber/20 bg-gradient-to-b from-amber/[0.06] to-transparent hover:border-amber/40"
              }`}
            >
              <h3 className={`text-[13px] font-bold leading-snug ${isDone ? "text-muted line-through" : ""}`}>
                {m.title}
              </h3>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{m.why}</p>
              <p className="mt-2.5 rounded-lg bg-white/[0.03] px-2.5 py-1.5 font-mono text-[11px] text-ink">
                <span className="text-muted">{m.metricLabel}: </span>
                {m.metricValue}
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-good/90">{m.impact}</p>
              <div className="mt-auto flex items-center gap-2 pt-3.5">
                {isDone ? (
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-good">
                    <Check size={13} aria-hidden /> Done — verifying impact
                  </span>
                ) : (
                  <>
                    <Link
                      href="/execute"
                      className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-molten via-amber to-ember px-3 py-1.5 text-[12px] font-bold text-black transition-opacity duration-200 hover:opacity-90"
                    >
                      Do this
                      <ArrowRight size={12} aria-hidden />
                    </Link>
                    <button
                      onClick={() => setDone((d) => ({ ...d, [m.id]: true }))}
                      className="rounded-lg border border-stroke-2 px-3 py-1.5 text-[12px] font-semibold text-muted transition-colors duration-200 hover:bg-white/5 hover:text-ink"
                    >
                      Mark done
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
