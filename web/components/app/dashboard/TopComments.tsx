"use client";

import { useState } from "react";
import { Check, CornerDownRight, Pencil, X } from "lucide-react";
import { topComments, type TopComment } from "@/lib/mock/console";

const DOT: Record<TopComment["sentiment"], string> = {
  positive: "bg-molten",
  question: "bg-amber",
  negative: "bg-ember",
};

/** Top comments — highest-signal engagement, each with a GATED suggested reply. */
export default function TopComments() {
  const [open, setOpen] = useState<string | null>(topComments[0]?.id ?? null);
  const [sent, setSent] = useState<Record<string, boolean>>({});

  return (
    <section id="comments" className="scroll-mt-4">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[15px] font-bold tracking-tight">Top comments</h2>
        <span className="text-[11px] text-mute">replies are drafted, never auto-sent</span>
      </header>
      <ul className="space-y-2.5">
        {topComments.map((c) => {
          const isOpen = open === c.id;
          return (
            <li key={c.id} className="rounded-xl border border-line bg-surface p-3.5">
              <div className="flex items-start gap-2.5">
                <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[c.sentiment]}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px]">
                    <span className="font-bold">{c.author}</span>
                    <span className="font-data text-mute-2"> · {c.platform} · on “{c.onPost}”</span>
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink/90">{c.snippet}</p>

                  <button
                    onClick={() => setOpen(isOpen ? null : c.id)}
                    className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-amber transition-opacity duration-200 hover:opacity-80"
                  >
                    <CornerDownRight size={13} aria-hidden />
                    {isOpen ? "Hide suggested reply" : "See suggested reply"}
                  </button>

                  {isOpen && (
                    <div className="mt-2.5 rounded-lg border border-line bg-surface-2 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-mute-2">
                        CMO draft
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed">{c.suggestedReply}</p>
                      {sent[c.id] ? (
                        <p className="mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-molten">
                          <Check size={13} aria-hidden /> Sent
                        </p>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={() => setSent((s) => ({ ...s, [c.id]: true }))}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-molten px-3 py-1.5 text-[12px] font-bold text-white transition-opacity duration-200 hover:opacity-90"
                          >
                            <Check size={13} aria-hidden /> Approve &amp; send
                          </button>
                          <button className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold transition-colors duration-200 hover:bg-[var(--overlay-subtle)]">
                            <Pencil size={12} aria-hidden /> Edit
                          </button>
                          <button className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-mute-2 transition-colors duration-200 hover:text-ember">
                            <X size={13} aria-hidden /> Skip
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
