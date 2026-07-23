"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUp, Check, Loader2, Lock, Sparkles, X } from "lucide-react";

/** The taster's third act: a follow-up chat pinned to the bottom of the verdict
 *  screen, seeded with the analysis the founder just saw. Every answer is
 *  grounded in THEIR result (the backend is handed the full payload as locked
 *  context). Public + rate-limited; after a few free turns it becomes the
 *  sign-up hook. */

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000";

type Msg = { role: "user" | "assistant"; content: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the taster payload shape lives in TasterExplore
export default function TasterChat({ context }: { context: any }) {
  const reduce = useReducedMotion();
  const company = (context?.company || context?.domain || "your business") as string;

  const greeting: Msg = {
    role: "assistant",
    content: `I just read ${company} cold. Ask me anything about your verdict — where to start, your competitors, or how to actually reach your first customers.`,
  };

  const [convo, setConvo] = useState<Msg[]>([]); // real exchanges (greeting is display-only)
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [freeTurns, setFreeTurns] = useState(5);
  const [walled, setWalled] = useState(false); // daily cap hit → sign up
  const scrollRef = useRef<HTMLDivElement>(null);

  const userTurns = convo.filter((m) => m.role === "user").length;
  const outOfTurns = userTurns >= freeTurns;

  useEffect(() => {
    if (expanded) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [convo, busy, expanded]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy || outOfTurns || walled) return;
    setExpanded(true);
    setErr(null);
    const nextConvo = [...convo, { role: "user" as const, content: text }];
    setConvo(nextConvo);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch(`${BACKEND}/taster/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, messages: nextConvo }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setWalled(true);
        setErr(null);
      } else if (res.ok && body?.reply) {
        setConvo((c) => [...c, { role: "assistant", content: body.reply }]);
        if (typeof body.free_turns === "number") setFreeTurns(body.free_turns);
      } else {
        setErr(typeof body?.detail === "string" ? body.detail : "The CMO hit a snag — try again.");
      }
    } catch {
      setErr("Couldn't reach your CMO — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const thread: Msg[] = [greeting, ...convo];
  const showWall = walled || outOfTurns;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-4">
      <div className="pointer-events-auto mx-auto w-full max-w-[720px]">
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, y: reduce ? 0 : 16, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: reduce ? 0 : 16, height: 0 }}
              className="glass mb-2 overflow-hidden rounded-2xl"
            >
              <div className="flex items-center justify-between border-b border-stroke px-4 py-2.5">
                <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
                  <Sparkles size={13} className="text-molten" aria-hidden /> Your CMO
                </span>
                <button
                  onClick={() => setExpanded(false)}
                  aria-label="Minimize chat"
                  className="rounded-lg p-1 text-muted transition-colors hover:text-ink"
                >
                  <X size={15} aria-hidden />
                </button>
              </div>

              <div ref={scrollRef} className="dash-scroll max-h-[min(52vh,440px)] space-y-3 overflow-y-auto px-4 py-4">
                {thread.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                        m.role === "user"
                          ? "bg-molten/[0.12] text-ink"
                          : "border border-stroke bg-surface text-ink"
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {busy && (
                  <div className="flex justify-start">
                    <div className="inline-flex items-center gap-2 rounded-2xl border border-stroke bg-surface px-3.5 py-2.5 text-[13px] text-muted">
                      <Loader2 size={14} className="animate-spin" aria-hidden /> thinking…
                    </div>
                  </div>
                )}
                {err && (
                  <p className="px-1 text-[12.5px] font-medium text-bad">{err}</p>
                )}

                {showWall && (
                  <div className="rounded-2xl border border-molten/30 bg-molten/[0.06] p-4 text-center">
                    <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-molten">
                      <Lock size={12} aria-hidden /> That&apos;s your free session
                    </p>
                    <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink">
                      Sign up free to keep the conversation going — and unlock the CMO that
                      actually <span className="font-semibold">does</span> the work, not just advises.
                    </p>
                    <Link
                      href="/sign-up"
                      className="mt-3 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-[color:var(--cta-ink,#0a0a0b)]"
                      style={{ background: "var(--gradient-brand)" }}
                    >
                      <Check size={14} aria-hidden /> Sign up free →
                    </Link>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* the composer — always pinned at the bottom */}
        {!showWall ? (
          <div className="glass flex items-center gap-2 rounded-2xl p-1.5 pl-4 shadow-[0_10px_40px_var(--shadow-color)]">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setExpanded(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  send();
                }
              }}
              disabled={busy}
              placeholder={`Ask your CMO about ${company}…`}
              className="min-w-0 flex-1 bg-transparent text-[14px] text-ink placeholder:text-mute-2 focus:outline-none"
              aria-label="Ask your CMO"
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[color:var(--cta-ink,#0a0a0b)] transition-opacity disabled:opacity-40"
              style={{ background: "var(--gradient-brand)" }}
            >
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <ArrowUp size={17} aria-hidden />}
            </button>
          </div>
        ) : (
          <Link
            href="/sign-up"
            className="glass flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-[13.5px] font-bold text-ink shadow-[0_10px_40px_var(--shadow-color)]"
          >
            <Lock size={14} className="text-molten" aria-hidden /> Sign up free to keep chatting with your CMO →
          </Link>
        )}

        {!expanded && !showWall && (
          <p className="mt-1.5 text-center text-[11px] text-mute-2">
            {freeTurns} free questions · grounded in your verdict · no sign-up to start
          </p>
        )}
      </div>
    </div>
  );
}
