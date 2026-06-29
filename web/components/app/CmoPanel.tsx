"use client";

import Logo from "@/components/app/Logo";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, Phone, PhoneOff, Send, X } from "lucide-react";
import type { ChatMsg } from "@/lib/mock/console";

type CallState = "idle" | "connecting" | "live";
type Phase = "listening" | "thinking" | "speaking";
type Turn = { who: "cmo" | "founder"; text: string };
type Wire = { role: "user" | "assistant"; content: string };

const GREETING =
  "Hey — good to actually talk. What's the one marketing thing on your mind right now?";
const ONBOARDING_PROMPT =
  "Complete your onboarding first — your CMO activates once your workspace is set up.";
const RECOGNITION_LANG = "en-IN";
const SILENCE_MS = 900; // pause this long → treat the founder's turn as finished

/* ── Minimal Web Speech typings (not in the default TS lib) ──────────────── */
type SRAlt = { transcript: string };
type SRResult = { isFinal: boolean; 0: SRAlt };
type SRResultList = { length: number; [i: number]: SRResult };
type SREvent = { resultIndex: number; results: SRResultList };
type SRErrorEvent = { error: string };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SREvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onstart: (() => void) | null;
};
type SRCtor = new () => SpeechRecognitionLike;

function makeRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.lang = RECOGNITION_LANG;
  r.continuous = true;
  r.interimResults = true;
  return r;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  return (
    voices.find((v) => /en[-_]IN/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang) && /google|natural/i.test(v.name)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    voices[0]
  );
}

/** The relationship: chat history (default) + a REAL live voice call — mic in,
 *  CMO speech out, grounded in the founder's company memory via the backend. */
export default function CmoPanel() {
  const [open, setOpen] = useState(false); // launcher closed by default
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [call, setCall] = useState<CallState>("idle");
  const [phase, setPhase] = useState<Phase>("listening");
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  // refs that callbacks read (state is stale inside SpeechRecognition handlers)
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const callRef = useRef<CallState>("idle");
  const speakingRef = useRef(false);
  const listeningRef = useRef(false);
  const wireRef = useRef<Wire[]>([]); // running [{role,content}] sent to the backend
  const finalRef = useRef(""); // buffered final words for the current founder turn
  const noFounderRef = useRef(false); // last askCmo failed because there's no workspace yet
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const phaseRef = useRef<Phase>("listening"); // handlers read the latest phase
  const endCallRef = useRef<() => void>(() => {}); // set once endCall is defined

  useEffect(() => {
    callRef.current = call;
  }, [call]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages]);

  // preload TTS voices (they populate asynchronously)
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const load = () => {
      voiceRef.current = pickVoice();
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  /* ── one shared call to the CMO brain ─────────────────────────────────── */
  const askCmo = useCallback(async (history: Wire[]): Promise<string | null> => {
    try {
      const res = await fetch("/api/cmo/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-20) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof data.reply === "string") {
        noFounderRef.current = false;
        return data.reply;
      }
      const noFounder = res.status === 400 && /no founder/i.test(data.error || "");
      noFounderRef.current = noFounder;
      setError(noFounder ? ONBOARDING_PROMPT : data.error || "The CMO couldn't respond.");
      return null;
    } catch {
      noFounderRef.current = false;
      setError("Couldn't reach the CMO. Is the backend running?");
      return null;
    }
  }, []);

  /* ── speech out (TTS) ─────────────────────────────────────────────────── */
  const speak = useCallback((text: string, onDone: () => void) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      onDone();
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voiceRef.current) u.voice = voiceRef.current;
    u.rate = 1.02;
    u.pitch = 1.0;
    speakingRef.current = true;
    setPhase("speaking");
    const finish = () => {
      if (!speakingRef.current) return;
      speakingRef.current = false;
      onDone();
    };
    u.onend = finish;
    u.onerror = finish; // never strand the call if TTS hiccups
    window.speechSynthesis.speak(u);
  }, []);

  /* ── listening (STT) ──────────────────────────────────────────────────── */
  const startListening = useCallback(() => {
    if (callRef.current !== "live" || speakingRef.current || listeningRef.current) return;
    const rec = recRef.current;
    if (!rec) return;
    try {
      finalRef.current = "";
      setInterim("");
      setPhase("listening");
      listeningRef.current = true;
      rec.start();
    } catch {
      // start() throws if already started — safe to ignore
    }
  }, []);

  const stopListening = useCallback(() => {
    listeningRef.current = false;
    if (silenceRef.current) clearTimeout(silenceRef.current);
    try {
      recRef.current?.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  // founder finished a turn → send it, speak the reply, then listen again
  const handleFounderTurn = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean || callRef.current !== "live") return;
      stopListening();
      setInterim("");
      setTranscript((t) => [...t, { who: "founder", text: clean }]);
      wireRef.current = [...wireRef.current, { role: "user", content: clean }];
      setPhase("thinking");
      askCmo(wireRef.current).then((reply) => {
        if (callRef.current !== "live") return;
        const say =
          reply ??
          (noFounderRef.current
            ? ONBOARDING_PROMPT
            : "Sorry — I didn't quite catch that. Say it again?");
        setTranscript((t) => [...t, { who: "cmo", text: say }]);
        wireRef.current = [...wireRef.current, { role: "assistant", content: say }];
        speak(say, startListening);
      });
    },
    [askCmo, speak, startListening, stopListening],
  );

  // wire the recognition handlers once
  const attachHandlers = useCallback(
    (rec: SpeechRecognitionLike) => {
      rec.onresult = (e: SREvent) => {
        // ignore our own voice echoing back (speaking), AND any late/buffered
        // result that arrives after a turn was already submitted (listening is
        // false once handleFounderTurn → stopListening runs). Without the second
        // guard, that stray result fires the same turn twice → double reply.
        if (speakingRef.current || !listeningRef.current) return;
        let interimText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const said = r[0]?.transcript ?? "";
          if (r.isFinal) finalRef.current += said + " ";
          else interimText += said;
        }
        setInterim(interimText);
        if (silenceRef.current) clearTimeout(silenceRef.current);
        silenceRef.current = setTimeout(() => {
          const turn = finalRef.current.trim() || interimText.trim();
          finalRef.current = "";
          if (turn) handleFounderTurn(turn);
        }, SILENCE_MS);
      };
      rec.onerror = (e: SRErrorEvent) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          setError("Microphone blocked — allow mic access and try again.");
          endCallRef.current();
        }
        // "no-speech"/"aborted" are normal; the flow restarts listening itself
      };
      rec.onend = () => {
        listeningRef.current = false;
        // keep the mic open across natural pauses while it's our turn to listen
        if (callRef.current === "live" && !speakingRef.current && phaseRef.current === "listening") {
          startListening();
        }
      };
    },
    [handleFounderTurn, startListening],
  );

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  /* ── call lifecycle ───────────────────────────────────────────────────── */
  const connect = useCallback(async () => {
    setError(null);
    const rec = makeRecognition();
    if (!rec) {
      setError("Voice needs Chrome or Edge on desktop. Use the text box below for now.");
      return;
    }
    setCall("connecting");
    callRef.current = "connecting";
    try {
      // trigger the mic permission prompt up front
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop()); // we only needed the permission
    } catch {
      setError("Microphone blocked — allow mic access and try again.");
      setCall("idle");
      callRef.current = "idle";
      return;
    }
    recRef.current = rec;
    attachHandlers(rec);
    wireRef.current = [];
    setTranscript([]);
    setInterim("");
    setCall("live");
    callRef.current = "live";
    // the CMO speaks first — instant, templated, zero API wait — then listens
    setTranscript([{ who: "cmo", text: GREETING }]);
    wireRef.current = [{ role: "assistant", content: GREETING }];
    speak(GREETING, startListening);
  }, [attachHandlers, speak, startListening]);

  const endCall = useCallback(() => {
    stopListening();
    speakingRef.current = false;
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    try {
      recRef.current?.abort();
    } catch {
      /* noop */
    }
    recRef.current = null;
    const turns = transcript.length;
    setCall("idle");
    callRef.current = "idle";
    setInterim("");
    if (turns > 1) {
      setMessages((m) => [
        ...m,
        {
          id: `call-${m.length}`,
          role: "cmo",
          text: `📞 Call ended — good talk. That's ${turns} exchanges saved to this thread.`,
          time: "now",
        },
      ]);
    }
    setTranscript([]);
  }, [stopListening, transcript.length]);

  // keep endCallRef pointing at the latest endCall (onerror is wired once)
  useEffect(() => {
    endCallRef.current = endCall;
  }, [endCall]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        /* noop */
      }
      if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);

  /* ── text chat (also real — same brain) ───────────────────────────────── */
  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    setSending(true);
    setError(null);
    setMessages((m) => [...m, { id: `u-${m.length}`, role: "founder", text, time: "now" }]);
    const history: Wire[] = [
      ...messages.map((m): Wire => ({ role: m.role === "cmo" ? "assistant" : "user", content: m.text })),
      { role: "user", content: text },
    ];
    const reply = await askCmo(history);
    if (reply) {
      setMessages((m) => [...m, { id: `c-${m.length}`, role: "cmo", text: reply, time: "now" }]);
    }
    setSending(false);
  }, [draft, sending, messages, askCmo]);

  const statusLabel =
    call === "connecting"
      ? "Connecting to your CMO…"
      : phase === "thinking"
        ? "Thinking…"
        : phase === "speaking"
          ? "Speaking…"
          : "Listening…";

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
              {call === "live" ? "on a call" : "online"}
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

      {/* body: chat thread OR live call */}
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {call === "idle" ? (
            <motion.div
              key="chat"
              ref={threadRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="dash-scroll absolute inset-0 space-y-3 overflow-y-auto p-4"
            >
              {messages.length === 0 && !sending && (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-line bg-surface">
                    <Logo width={26} height={20} />
                  </span>
                  <p className="text-[13px] font-semibold">Talk to your CMO</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-mute">
                    Ask anything about your marketing — or tap{" "}
                    <span className="font-semibold text-molten">Call CMO</span> to talk live.
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
            </motion.div>
          ) : (
            <motion.div
              key="call"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-between p-5"
            >
              {/* orb */}
              <div className="flex flex-1 flex-col items-center justify-center">
                <div className="relative grid h-28 w-28 place-items-center">
                  {(call === "connecting" || phase === "speaking") && (
                    <>
                      <span aria-hidden className="ring absolute inset-0 rounded-full border border-molten/50" />
                      <span aria-hidden className="ring absolute inset-0 rounded-full border border-molten/50" style={{ animationDelay: "0.5s" }} />
                    </>
                  )}
                  <span
                    aria-hidden
                    className={`h-20 w-20 rounded-full bg-gradient-to-br from-molten via-amber to-ember ${call === "live" ? "orb" : "opacity-70"}`}
                  />
                  {call === "live" && phase === "listening" && (
                    <Mic size={20} className="absolute text-white/80" aria-hidden />
                  )}
                </div>
                <p className="mt-4 text-[13px] font-semibold">{statusLabel}</p>
              </div>

              {/* live transcript */}
              {call === "live" && (
                <div className="dash-scroll mb-4 max-h-44 w-full space-y-1.5 overflow-y-auto">
                  {transcript.map((t, i) => (
                    <p key={i} className="text-[12px] leading-snug">
                      <span className={`font-data text-[10px] ${t.who === "cmo" ? "text-molten" : "text-mute-2"}`}>
                        {t.who === "cmo" ? "CMO" : "You"}
                        {" · "}
                      </span>
                      <span className="text-ink/90">{t.text}</span>
                    </p>
                  ))}
                  {interim && (
                    <p className="text-[12px] leading-snug opacity-60">
                      <span className="font-data text-[10px] text-mute-2">You · </span>
                      <span className="text-ink/70">{interim}</span>
                    </p>
                  )}
                </div>
              )}

              <button
                onClick={endCall}
                className="inline-flex items-center gap-2 rounded-full bg-ember px-5 py-2.5 text-[13px] font-bold text-white transition-opacity duration-200 hover:opacity-90"
              >
                <PhoneOff size={15} aria-hidden /> End call
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* footer */}
      {call === "idle" && (
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
            <button onClick={send} disabled={sending} aria-label="Send" className="text-mute transition-colors duration-200 hover:text-molten disabled:opacity-50">
              <Send size={15} aria-hidden />
            </button>
          </div>
          <button
            onClick={connect}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-molten via-amber to-ember py-2.5 text-[13px] font-extrabold text-white transition-opacity duration-200 hover:opacity-90"
          >
            <Phone size={15} aria-hidden /> Call CMO
          </button>
        </div>
      )}
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
