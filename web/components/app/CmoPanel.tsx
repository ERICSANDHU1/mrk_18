"use client";

import Logo from "@/components/app/Logo";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Phone, Send, X } from "lucide-react";
import type { ChatMsg } from "@/lib/mock/console";

/** The floating CMO drawer: a quick text thread with the CMO from any page.
 *  The LIVE voice call happens in the Chat section — "Call CMO" (and the
 *  concierge's "Yes") routes there and starts it, with every spoken turn
 *  landing in the real chat thread. */
export default function CmoPanel() {
  const [open, setOpen] = useState(false); // launcher closed by default
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Tell the app shell to make room while the panel is open: it collapses the left
  // rail and pads the content so the drawer never overlaps the page.
  useEffect(() => {
    window.dispatchEvent(new Event(open ? "mrk18:cmo-open" : "mrk18:cmo-closed"));
  }, [open]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  /* ── text chat (real — same brain as the call) ───────────────────────── */
  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    setSending(true);
    setError(null);
    const next: ChatMsg[] = [
      ...messages,
      { id: `u-${messages.length}`, role: "founder", text, time: "now" },
    ];
    setMessages(next);
    try {
      const history = next.map((m) => ({
        role: m.role === "cmo" ? "assistant" : "user",
        content: m.text,
      }));
      const res = await fetch("/api/cmo/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-20), mode: "text" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof data.reply === "string") {
        setMessages((m) => [...m, { id: `c-${m.length}`, role: "cmo", text: data.reply, time: "now" }]);
      } else {
        setError(data.error || "The CMO couldn't respond.");
      }
    } catch {
      setError("Couldn't reach the CMO. Is the backend running?");
    } finally {
      setSending(false);
    }
  }, [draft, sending, messages]);

  // the live call lives in Chat — go there and start it
  const startCall = useCallback(() => {
    setOpen(false);
    if (pathname.startsWith("/chat")) {
      window.dispatchEvent(new Event("mrk18:cmo-call")); // ChatClient starts the call
    } else {
      router.push("/chat?call=1");
    }
  }, [pathname, router]);

  return (
    <>
      {/* launcher — the small circular MRK18 button (default state) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open your CMO"
          className="fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-full border border-line bg-surface shadow-lg shadow-[var(--shadow-color)] transition-transform duration-200 hover:scale-105 active:scale-95"
        >
          <Logo width={26} height={20} />
        </button>
      )}

      {/* the CMO panel — slides in as a right-side drawer when opened */}
      <AnimatePresence>
        {open && (
          <motion.aside
            key="cmo-drawer"
            initial={{ x: 380 }}
            animate={{ x: 0 }}
            exit={{ x: 380 }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            className="fixed inset-y-0 right-0 z-50 flex h-full w-[360px] max-w-[88vw] flex-col border-l border-line bg-[var(--sidebar)] shadow-2xl shadow-[var(--shadow-color)]"
          >
            <header className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-xl border border-line bg-surface">
                  <Logo width={18} height={14} />
                </span>
                <div>
                  <p className="text-[13px] font-bold leading-tight">Your CMO</p>
                  <p className="flex items-center gap-1.5 text-[11px] text-mute">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-molten pulse-dot" />
                    online
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close panel"
                className="grid h-7 w-7 place-items-center rounded-lg text-mute transition-colors duration-200 hover:bg-surface-2 hover:text-ink"
              >
                <X size={15} aria-hidden />
              </button>
            </header>

            {/* body — the quick text thread */}
            <div ref={threadRef} className="dash-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && !sending && (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-line bg-surface">
                    <Logo width={26} height={20} />
                  </span>
                  <p className="text-[13px] font-semibold">Talk to your CMO</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-mute">
                    Ask anything about your marketing — or tap{" "}
                    <span className="font-semibold text-molten">Call CMO</span> to talk live in
                    Chat.
                  </p>
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`flex flex-col ${m.role === "founder" ? "items-end" : "items-start"}`}>
                  <div
                    className={`max-w-[88%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                      m.role === "cmo"
                        ? "rounded-tl-sm border border-molten/20 bg-molten/[0.07] text-ink"
                        : "rounded-tr-sm bg-surface-2 text-ink"
                    }`}
                  >
                    {m.text}
                  </div>
                  <span className="font-data mt-0.5 px-1 text-[10px] text-mute-2">{m.time}</span>
                </div>
              ))}
              {sending && <p className="px-1 text-[11px] text-mute-2">CMO is thinking…</p>}
            </div>

            {/* footer */}
            <div className="border-t border-line p-3">
              {error && <p className="mb-2 px-1 text-[11px] text-ember">{error}</p>}
              <div className="mb-2.5 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Message your CMO…"
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-mute-2 focus:outline-none"
                />
                <button
                  onClick={send}
                  disabled={sending}
                  aria-label="Send"
                  className="text-mute transition-colors duration-200 hover:text-molten disabled:opacity-50"
                >
                  <Send size={15} aria-hidden />
                </button>
              </div>
              <button
                onClick={startCall}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-molten py-2.5 text-[13px] font-extrabold text-white transition-opacity duration-200 hover:opacity-90"
              >
                <Phone size={15} aria-hidden /> Call CMO
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
