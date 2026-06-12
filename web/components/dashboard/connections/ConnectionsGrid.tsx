"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plug, RefreshCw, TriangleAlert } from "lucide-react";
import type { Connection } from "@/lib/mock/types";

/** Data sources — including the states that matter most: not-connected ones. */
export default function ConnectionsGrid({ initial }: { initial: Connection[] }) {
  const [items, setItems] = useState(initial);
  const [connecting, setConnecting] = useState<string | null>(null);
  const missing = items.filter((c) => !c.connected);

  const connect = (id: string) => {
    setConnecting(id);
    // simulated OAuth round-trip — real flow goes through the mrk18 API
    setTimeout(() => {
      setItems((list) =>
        list.map((c) => (c.id === id ? { ...c, connected: true, lastSync: "just now" } : c)),
      );
      setConnecting(null);
    }, 1200);
  };

  return (
    <>
      {missing.length > 0 && (
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-watch/25 bg-watch/[0.06] px-4 py-3 text-[13px] leading-relaxed"
        >
          <TriangleAlert size={15} className="mt-0.5 shrink-0 text-watch" aria-hidden />
          <span>
            <strong className="font-bold">{missing.length} of {items.length} sources missing.</strong>{" "}
            Until {missing.map((m) => m.name).join(" and ")} are connected, your CMO is judging the
            funnel partially blind — verdicts stay labelled lower-confidence.
          </span>
        </motion.p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((c, i) => {
          const isConnecting = connecting === c.id;
          return (
            <motion.article
              key={c.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: i * 0.06 }}
              className={`flex flex-col rounded-2xl border p-5 ${
                c.connected ? "border-stroke-2 bg-surface" : "border-dashed border-stroke-2 bg-surface/40"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className={`grid h-9 w-9 place-items-center rounded-xl border text-[13px] font-extrabold ${
                      c.connected
                        ? "border-stroke-2 bg-surface-2 text-ink"
                        : "border-stroke-2 bg-surface text-muted"
                    }`}
                  >
                    {c.name.slice(0, 1)}
                  </span>
                  <div>
                    <h2 className={`text-[14px] font-bold tracking-tight ${c.connected ? "" : "text-ink/80"}`}>
                      {c.name}
                    </h2>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{c.category}</p>
                  </div>
                </div>
                {c.connected ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-good/25 bg-good/10 px-2.5 py-0.5 text-[11px] font-semibold text-good">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-good pulse-dot" />
                    Connected
                  </span>
                ) : (
                  <span className="rounded-full border border-stroke-2 bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-muted">
                    Not connected
                  </span>
                )}
              </div>

              <p className={`mt-3.5 flex-1 text-[12px] leading-relaxed ${c.connected ? "text-muted" : "text-ink/80"}`}>
                {c.connected ? c.unlocks : <><strong className="font-semibold">Unlocks:</strong> {c.unlocks}</>}
              </p>

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-stroke-2 pt-3.5">
                {c.connected ? (
                  <>
                    <p className="font-mono text-[11px] text-muted">synced {c.lastSync}</p>
                    <div className="flex gap-2">
                      <button className="inline-flex items-center gap-1.5 rounded-lg border border-stroke-2 px-2.5 py-1.5 text-[11px] font-semibold text-muted transition-colors duration-200 hover:bg-white/5 hover:text-ink">
                        <RefreshCw size={11} aria-hidden />
                        Sync now
                      </button>
                      <button className="rounded-lg px-2 py-1.5 text-[11px] text-muted/70 transition-colors duration-200 hover:text-bad">
                        Disconnect
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={() => connect(c.id)}
                    disabled={isConnecting}
                    className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold transition-all duration-200 ${
                      isConnecting
                        ? "cursor-wait border border-stroke-2 bg-surface-2 text-muted"
                        : "bg-gradient-to-r from-molten via-amber to-ember text-black hover:opacity-90"
                    }`}
                  >
                    <Plug size={13} aria-hidden />
                    {isConnecting ? "Connecting…" : `Connect ${c.name}`}
                  </button>
                )}
              </div>
            </motion.article>
          );
        })}
      </div>
    </>
  );
}
