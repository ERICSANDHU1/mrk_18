"use client";

import { useState } from "react";
import { Check, FileText, MessageSquare, Megaphone, Pencil, X } from "lucide-react";
import { approvals, type Approval } from "@/lib/mock/console";

const KIND_ICON = { post: FileText, reply: MessageSquare, campaign: Megaphone };

/** Approval queue — nothing the CMO drafted goes out without a tap here. */
export default function ApprovalQueue() {
  const [decided, setDecided] = useState<Record<string, "approved" | "rejected">>({});
  const pending = approvals.filter((a) => !decided[a.id]);

  return (
    <section id="approvals" className="scroll-mt-4">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[15px] font-bold tracking-tight">
          Approvals
          <span className="font-data ml-2 rounded-full bg-molten/15 px-2 py-0.5 text-[11px] font-semibold text-molten">
            {pending.length}
          </span>
        </h2>
        <span className="text-[11px] text-mute">3 urgent · drafted by your CMO</span>
      </header>

      <ul className="space-y-2.5">
        {approvals.map((a) => {
          const state = decided[a.id];
          const Icon = KIND_ICON[a.kind];
          return (
            <li
              key={a.id}
              className={`rounded-xl border p-3.5 transition-colors duration-300 ${
                state === "approved"
                  ? "border-molten/25 bg-molten/[0.05]"
                  : state === "rejected"
                    ? "border-line bg-surface/40 opacity-60"
                    : a.urgent
                      ? "border-line bg-surface"
                      : "border-line bg-surface"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-mute">
                  <Icon size={14} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[13px] font-bold leading-snug">{a.title}</h3>
                    {a.urgent && !state && (
                      <span className="shrink-0 rounded-full bg-ember/15 px-1.5 py-0.5 text-[10px] font-bold text-ember">
                        urgent
                      </span>
                    )}
                  </div>
                  <p className="font-data mt-0.5 text-[11px] text-mute-2">
                    {a.platform} · {a.lane} · {a.scheduledFor}
                  </p>
                  <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-mute">{a.snippet}</p>

                  {state ? (
                    <p
                      className={`mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-semibold ${
                        state === "approved" ? "text-molten" : "text-mute-2"
                      }`}
                    >
                      {state === "approved" ? <Check size={13} /> : <X size={13} />}
                      {state === "approved" ? "Approved — scheduled" : "Rejected"}
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => setDecided((d) => ({ ...d, [a.id]: "approved" }))}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-molten px-3 py-1.5 text-[12px] font-bold text-white transition-opacity duration-200 hover:opacity-90"
                      >
                        <Check size={13} aria-hidden /> Approve
                      </button>
                      <button className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold text-ink transition-colors duration-200 hover:bg-[var(--overlay-subtle)]">
                        <Pencil size={12} aria-hidden /> Edit
                      </button>
                      <button
                        onClick={() => setDecided((d) => ({ ...d, [a.id]: "rejected" }))}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-mute-2 transition-colors duration-200 hover:text-ember"
                      >
                        <X size={13} aria-hidden /> Reject
                      </button>
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
