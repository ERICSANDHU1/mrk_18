"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUp, BookOpen, Loader2, Sparkles } from "lucide-react";
import Wordmark from "@/components/app/Wordmark";

/** Standalone Brain test bench — isolated from the app, mrk18-skinned. Paste a
 *  company + optional knowledge, chat, and see which adapter answered + whether
 *  the trained Brain is wired. No auth, no onboarding. Calls /brain/chat. */

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000";

type Msg = { role: "user" | "assistant"; content: string; adapter?: string };

const ADAPTER_TINT: Record<string, string> = {
  content: "#b4532a",
  market_intel: "#1d6fa5",
  audience: "#0f6e56",
  usp: "#7c5cf0",
  strategy: "#c77a00",
  script: "#993556",
  analytics: "#0c447c",
  synthesis: "#5f5e5a",
};

const SAMPLES = [
  "write me a LinkedIn launch post",
  "who are my competitors?",
  "make a 30s reel script",
  "is my ad spend working?",
];

export default function BrainTestPage() {
  const [company, setCompany] = useState("");
  const [context, setContext] = useState("");
  const [showCtx, setShowCtx] = useState(false);
  const [convo, setConvo] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ brain: boolean; model: string; adapter: string } | null>(null);
  const scroll = useRef<HTMLDivElement>(null);

  const send = async (text: string) => {
    text = text.trim();
    if (!text || busy) return;
    const next: Msg[] = [...convo, { role: "user", content: text }];
    setConvo(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch(`${BACKEND}/brain/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          context,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const b = await res.json().catch(() => ({}));
      if (res.ok && b?.reply) {
        setConvo((c) => [...c, { role: "assistant", content: b.reply, adapter: b.adapter }]);
        setStatus({ brain: !!b.brain_connected, model: b.base_model, adapter: b.adapter });
      } else {
        const msg =
          typeof b?.detail === "string"
            ? b.detail
            : Array.isArray(b?.detail)
              ? b.detail.map((e: { msg?: string }) => e?.msg).filter(Boolean).join("; ")
              : b?.detail
                ? JSON.stringify(b.detail)
                : "error";
        setConvo((c) => [...c, { role: "assistant", content: `⚠ ${msg}` }]);
      }
    } catch {
      setConvo((c) => [...c, { role: "assistant", content: "⚠ couldn't reach the backend" }]);
    } finally {
      setBusy(false);
      setTimeout(() => scroll.current?.scrollTo({ top: 1e9, behavior: "smooth" }), 60);
    }
  };

  return (
    <div className="theme-sand min-h-screen">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-30 bg-[image:var(--taster-bg)]" />
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-6">
        {/* header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-molten/[0.14] text-molten">
              <Sparkles size={18} aria-hidden />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <Wordmark className="text-[16px] font-extrabold text-ink" />
                <span className="text-[14px] font-semibold text-muted">Brain test bench</span>
              </div>
              <p className="text-[11.5px] text-mute-2">isolated · routes each message to an adapter</p>
            </div>
          </div>
          <span
            className="rounded-full border px-3 py-1 text-[11px] font-bold"
            style={
              status?.brain
                ? { borderColor: "rgba(124,92,240,0.4)", color: "#7c5cf0", background: "rgba(124,92,240,0.08)" }
                : { borderColor: "var(--stroke)", color: "var(--muted)" }
            }
          >
            {status ? (status.brain ? `🧠 Brain · ${status.model}` : `⚡ Groq · ${status.model}`) : "not yet queried"}
          </span>
        </div>

        {/* company + knowledge */}
        <div className="glass mt-5 rounded-2xl p-3">
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Company (optional grounding) — e.g. Nourish, high-protein pasta"
            className="w-full rounded-xl border border-stroke bg-surface px-3.5 py-2.5 text-[14px] text-ink placeholder:text-mute-2 focus:outline-none"
          />
          <button
            onClick={() => setShowCtx((s) => !s)}
            className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted transition-colors hover:text-ink"
          >
            <BookOpen size={13} aria-hidden /> {showCtx ? "Hide" : "Add"} knowledge / context (manual RAG)
          </button>
          {showCtx && (
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={4}
              placeholder="Paste brand docs, product facts, past posts… the Brain will ground its answer in this."
              className="mt-2 w-full resize-none rounded-xl border border-stroke bg-surface px-3.5 py-2.5 text-[13px] text-ink placeholder:text-mute-2 focus:outline-none"
            />
          )}
        </div>

        {/* thread */}
        <div ref={scroll} className="dash-scroll glass mt-4 flex-1 space-y-4 overflow-y-auto rounded-2xl p-4">
          {convo.length === 0 && (
            <div className="grid h-full place-items-center">
              <div className="text-center">
                <p className="text-[13px] text-muted">Route a message to an adapter.</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {SAMPLES.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-full border border-stroke bg-surface px-3 py-1.5 text-[12px] text-ink transition-colors hover:border-molten/40"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {convo.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className="max-w-[86%]">
                {m.adapter && (
                  <span
                    className="text-[10px] font-bold uppercase tracking-[0.14em]"
                    style={{ color: ADAPTER_TINT[m.adapter] ?? "var(--molten)" }}
                  >
                    {m.adapter}
                  </span>
                )}
                <div
                  className={`mt-1 whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                    m.role === "user" ? "bg-molten/[0.12] text-ink" : "border border-stroke bg-surface text-ink"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            </motion.div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-2xl border border-stroke bg-surface px-3.5 py-2.5 text-[13px] text-muted">
                <Loader2 size={14} className="animate-spin" aria-hidden /> routing + thinking…
              </div>
            </div>
          )}
        </div>

        {/* composer */}
        <div className="taster-composer glass mt-4 flex items-center gap-2 rounded-2xl p-1.5 pl-4">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            disabled={busy}
            placeholder="Message the Brain…"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-ink placeholder:text-mute-2 focus:outline-none"
          />
          <button
            onClick={() => send(input)}
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[color:var(--cta-ink,#fff)] transition-opacity disabled:opacity-40"
            style={{ background: "var(--gradient-brand)" }}
          >
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <ArrowUp size={17} aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  );
}
