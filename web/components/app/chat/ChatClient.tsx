"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUp, Loader2, Mic, Plus } from "lucide-react";

type Role = "user" | "cmo";
type Msg = { id: string; role: Role; text: string };
type Wire = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What should I post this week?",
  "Sharpen my positioning in one line",
  "Who's my real competitor — and why?",
  "Write me a punchy LinkedIn hook",
];
const ONBOARDING_PROMPT =
  "Finish onboarding first — your CMO activates once your workspace is set up.";

/** Full-page chat with the CMO. Same brain as the floating panel — posts the
 *  running transcript to /api/cmo/voice (Groq), grounded in the founder's memory.
 *  Each conversation is saved to /api/chats so it shows in the sidebar Recents. */
export default function ChatClient() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const sessionIdRef = useRef<string | null>(null); // the saved chat's id (null = unsaved)
  const hydratedIdRef = useRef<string | null>(null); // what the URL ?id is in sync with
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  // grow the textarea with its content, up to a cap (then it scrolls)
  const resize = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, []);

  // Load the chat named in the URL (?id=…), or reset to a fresh one when there's
  // none. Skips when the URL already matches what we hold (e.g. right after we
  // created a chat and pushed its id) so there's no reload flash.
  useEffect(() => {
    const urlId = searchParams.get("id");
    if (urlId === hydratedIdRef.current) return;
    if (!urlId) {
      hydratedIdRef.current = null;
      sessionIdRef.current = null;
      setMessages([]);
      setError(null);
      return;
    }
    let active = true;
    hydratedIdRef.current = urlId;
    sessionIdRef.current = urlId;
    setError(null);
    fetch(`/api/chats/${urlId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active || !d || !Array.isArray(d.messages)) return;
        setMessages(
          d.messages.map((m: { role: string; text: string }, i: number): Msg => ({
            id: `h-${i}`,
            role: m.role === "cmo" ? "cmo" : "user",
            text: m.text,
          })),
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [searchParams]);

  // Save the conversation after each exchange. The first save creates the chat
  // (titled from the first message) and pins its id in the URL; later saves
  // update it. Best-effort — the chat still works in-memory if it fails.
  const persist = useCallback(
    async (msgs: Msg[]) => {
      const payload = { messages: msgs.map((m) => ({ role: m.role, text: m.text })) };
      try {
        if (sessionIdRef.current) {
          await fetch(`/api/chats/${sessionIdRef.current}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        } else {
          const res = await fetch("/api/chats", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data?.id) {
            sessionIdRef.current = data.id;
            hydratedIdRef.current = data.id;
            router.replace(`/chat?id=${data.id}`, { scroll: false });
          }
        }
        window.dispatchEvent(new CustomEvent("mrk18:chats-changed"));
      } catch {
        /* best-effort persistence */
      }
    },
    [router],
  );

  const submit = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || sending) return;
      setDraft("");
      requestAnimationFrame(resize);
      setError(null);
      setSending(true);

      const next: Msg[] = [...messages, { id: `u-${Date.now()}`, role: "user", text }];
      setMessages(next);
      const history: Wire[] = next.map((m) => ({
        role: m.role === "cmo" ? "assistant" : "user",
        content: m.text,
      }));

      try {
        const res = await fetch("/api/cmo/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history.slice(-40), mode: "text" }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && typeof data.reply === "string") {
          const full: Msg[] = [...next, { id: `c-${Date.now()}`, role: "cmo", text: data.reply }];
          setMessages(full);
          void persist(full);
        } else {
          const noFounder = res.status === 400 && /no founder/i.test(data.error || "");
          setError(noFounder ? ONBOARDING_PROMPT : data.error || "The CMO couldn't respond.");
        }
      } catch {
        setError("Couldn't reach the CMO. Is the backend running?");
      } finally {
        setSending(false);
      }
    },
    [messages, sending, resize, persist],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(draft);
    }
  };

  const empty = messages.length === 0;

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <header className="flex shrink-0 items-center gap-2.5 border-b border-line px-5 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-xl border border-line bg-surface">
          <Image src="/logo-light.svg" alt="mrk18" width={18} height={14} />
        </span>
        <div className="leading-tight">
          <p className="text-[13px] font-bold text-ink">Your CMO</p>
          <p className="flex items-center gap-1.5 text-[11px] text-mute">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-molten pulse-dot" />
            online · grounded in your company
          </p>
        </div>
      </header>

      {/* thread */}
      <div ref={threadRef} className="dash-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          {empty ? (
            <div className="flex flex-col items-center px-4 pt-8 text-center sm:pt-12">
              <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-line bg-surface">
                <Image src="/logo-light.svg" alt="mrk18" width={30} height={23} />
              </span>
              <h1 className="font-display text-[26px] leading-tight text-ink">Talk to your CMO</h1>
              <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-mute">
                Ask anything about your marketing — positioning, content, competitors, your next
                move. Grounded in your company.
              </p>
              <div className="mt-6 grid w-full max-w-md gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => submit(s)}
                    className="rounded-xl border border-line bg-surface px-3.5 py-3 text-left text-[13px] text-ink transition-colors hover:border-molten/40 hover:bg-surface-2"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed ${
                      m.role === "cmo"
                        ? "rounded-tl-sm border border-molten/20 bg-molten/[0.07] text-ink"
                        : "rounded-tr-sm bg-surface-2 text-ink"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-molten/20 bg-molten/[0.07] px-3.5 py-2.5 text-[13px] text-mute">
                    <span className="flex gap-1" aria-hidden>
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-molten [animation-delay:-0.2s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-molten [animation-delay:-0.1s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-molten" />
                    </span>
                    thinking…
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* composer — Claude-Code-style input bar */}
      <div className="shrink-0 border-t border-line bg-bg px-4 py-4">
        <div className="mx-auto w-full max-w-3xl">
          {error && <p className="mb-2 px-1 text-[12px] text-ember">{error}</p>}
          <div className="rounded-2xl border border-line bg-surface shadow-sm transition-colors focus-within:border-molten/50">
            <div className="flex items-end gap-2 px-3 pt-3">
              <textarea
                ref={taRef}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  resize();
                }}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Message your CMO…"
                className="dash-scroll max-h-40 min-h-[24px] flex-1 resize-none bg-transparent text-[14px] leading-relaxed text-ink placeholder:text-mute-2 focus:outline-none"
              />
              <button
                onClick={() => submit(draft)}
                disabled={!draft.trim() || sending}
                aria-label="Send message"
                className="mb-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-molten text-white transition-opacity hover:opacity-90 disabled:bg-surface-2 disabled:text-mute-2"
              >
                {sending ? (
                  <Loader2 size={15} className="animate-spin" aria-hidden />
                ) : (
                  <ArrowUp size={16} aria-hidden />
                )}
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-line px-2.5 py-2">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  title="Attachments — coming soon"
                  disabled
                  className="grid h-7 w-7 place-items-center rounded-lg text-mute-2 disabled:opacity-50"
                >
                  <Plus size={15} aria-hidden />
                </button>
                <button
                  type="button"
                  title="Voice — use the CMO panel (bottom-right) for a live call"
                  disabled
                  className="grid h-7 w-7 place-items-center rounded-lg text-mute-2 disabled:opacity-50"
                >
                  <Mic size={15} aria-hidden />
                </button>
              </div>
              <div className="flex items-center gap-2 pr-1 text-[11px] text-mute-2">
                <span className="hidden sm:inline">Enter to send · Shift+Enter for newline</span>
                <span className="font-data">CMO</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
