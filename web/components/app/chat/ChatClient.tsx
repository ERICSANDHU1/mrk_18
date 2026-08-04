"use client";

import Logo from "@/components/app/Logo";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  ArrowRight,
  ArrowUp,
  AudioLines,
  Brain,
  Loader2,
  Lock,
  Mic,
  PenLine,
  PhoneOff,
  Plus,
  Sparkles,
  Swords,
  Target,
  X,
} from "lucide-react";
import { cleanCmoText } from "@/lib/text";
import { useCmoVoiceCall } from "@/components/app/useCmoVoiceCall";

type Role = "user" | "cmo";
type Msg = { id: string; role: Role; text: string; image?: string };
type Wire = { role: "user" | "assistant"; content: string; image?: string };

// four marketing words → each fires a useful starter prompt
const PILLS = [
  { word: "Positioning", prompt: "Sharpen my positioning in one line.", icon: Target },
  { word: "Content", prompt: "What should I post this week?", icon: PenLine },
  { word: "Competitors", prompt: "Who's my real competitor — and why?", icon: Swords },
  { word: "Hooks", prompt: "Write me a punchy LinkedIn hook.", icon: Sparkles },
];

const ONBOARDING_PROMPT =
  "Finish onboarding first — your CMO activates once your workspace is set up.";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB — the vision-upload size cap

// Claude-style time-aware greeting for the empty chat
function greetingFor(hour: number, name?: string | null): string {
  if (hour < 5 || hour >= 22) {
    return name ? `Burning the midnight oil, ${name}?` : "Burning the midnight oil?";
  }
  const base = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return name ? `${base}, ${name}` : base;
}

/* ── minimal Web Speech typings (not in the default TS lib) ─────────────── */
type SRAlt = { transcript: string };
type SRResult = { isFinal: boolean; 0: SRAlt };
type SRResultList = { length: number; [i: number]: SRResult };
type SREvent = { resultIndex: number; results: SRResultList };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;

  start: () => void;
  stop: () => void;

  onstart: (() => void) | null;
  onresult: ((e: SREvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e?: unknown) => void) | null;
};
type SRCtor = new () => SpeechRecognitionLike;

/** Full-page chat with the CMO. Same brain as the floating panel — posts the
 *  running transcript to /api/cmo/voice (Groq), grounded in the founder's memory.
 *  Voice: the mic listens (Web Speech), fills the draft, and Enter sends it. */
export default function ChatClient() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // free-chat funnel — used/cap come from the account (Clerk metadata via
  // /api/chat-usage); at the cap we pop the onboarding / upgrade modal.
  const [quota, setQuota] = useState<{ used: number; cap: number; onboarded: boolean } | null>(null);
  const [showQuota, setShowQuota] = useState(false);
  const limitReached = !!quota && quota.used >= quota.cap;
  const extraChatsLeft = quota
    ? quota.onboarded
      ? Math.max(0, 10 - Math.max(0, quota.used - 5))
      : Math.max(0, 5 - quota.used)
    : null;
  // image upload → Terra vision (critique an ad/screenshot). `vision` gates the
  // button; `attachment` is the pending image (data URL) for the next send.
  const [attachment, setAttachment] = useState<string | null>(null);
  const [vision, setVision] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const micActiveRef = useRef(false);
  const micFinalRef = useRef("");
  const micRestartTimerRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null); // the saved chat's id (null = unsaved)
  const hydratedIdRef = useRef<string | null>(null); // what the URL ?id is in sync with
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();

  const refreshQuota = useCallback(() => {
    fetch("/api/chat-usage", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((q) => {
        if (q && typeof q.used === "number") {
          setQuota({ used: q.used, cap: q.cap, onboarded: !!q.onboarded });
        }
        if (q) setVision(!!q.vision);
      })
      .catch(() => {});
  }, []);

  const stopMic = useCallback(() => {
    micActiveRef.current = false;
    micFinalRef.current = "";
    if (micRestartTimerRef.current !== null) {
      window.clearTimeout(micRestartTimerRef.current);
      micRestartTimerRef.current = null;
    }
    recRef.current?.stop();
  }, []);

  const ensureMicPermission = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("speech-recognition-unsupported");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  }, []);

  // time-aware greeting, set after mount so SSR and client can't disagree
  const [greeting, setGreeting] = useState("");
  useEffect(() => {
    setGreeting(greetingFor(new Date().getHours(), user?.firstName));
  }, [user?.firstName]);

  // how many free chats this account has left (and which tier they're on)
  useEffect(() => {
    refreshQuota();

    const onOnboardingCompleted = () => refreshQuota();
    const onFocus = () => refreshQuota();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshQuota();
    };

    window.addEventListener("mrk18:onboarding-completed", onOnboardingCompleted);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("mrk18:onboarding-completed", onOnboardingCompleted);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshQuota]);

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
  // none. Skips when the URL already matches what we hold so there's no flash.
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

  // Save the conversation after each exchange (creates the chat on first save).
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

  /* ── the LIVE voice call — turns render as real messages in this thread ── */
  const messagesRef = useRef<Msg[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const onCallTurn = useCallback(
    (who: "founder" | "cmo", text: string) => {
      const next: Msg[] = [
        ...messagesRef.current,
        {
          id: `${who}-${Date.now()}-${messagesRef.current.length}`,
          role: who === "cmo" ? "cmo" : "user",
          text,
        },
      ];
      messagesRef.current = next;
      setMessages(next); // the thread auto-scrolls as each spoken turn lands
      if (who === "cmo") void persist(next); // the call saves to this chat
    },
    [persist],
  );

  const { call, phase, connect: connectCall, endCall, interrupt } = useCmoVoiceCall({
    onTurn: onCallTurn,
    onError: setError,
  });

  // start a call, seeding the CMO with this thread's history
  const beginCall = useCallback(() => {
    setError(null);
    void connectCall(
      messagesRef.current.map((m) => ({
        role: m.role === "cmo" ? ("assistant" as const) : ("user" as const),
        content: m.text,
      })),
    );
  }, [connectCall]);

  // the concierge "Yes" (already on /chat) and the drawer's Call CMO land here
  useEffect(() => {
    const onCallEvent = () => beginCall();
    window.addEventListener("mrk18:cmo-call", onCallEvent);
    return () => window.removeEventListener("mrk18:cmo-call", onCallEvent);
  }, [beginCall]);

  // …or via /chat?call=1 from any other page
  useEffect(() => {
    if (searchParams.get("call") !== "1") return;
    const id = searchParams.get("id");
    router.replace(id ? `/chat?id=${id}` : "/chat", { scroll: false });
    beginCall();
  }, [searchParams, router, beginCall]);

  // sidebar "New chat" → a clean slate (also ends any live call)
  const resetThread = useCallback(() => {
    endCall(); // a fresh chat shouldn't inherit a live call
    hydratedIdRef.current = null;
    sessionIdRef.current = null;
    messagesRef.current = [];
    setMessages([]);
    setDraft("");
    setError(null);
    router.replace("/chat", { scroll: false });
  }, [endCall, router]);

  // it arrives two ways: the instant event (already on /chat) …
  useEffect(() => {
    const onNew = () => resetThread();
    window.addEventListener("mrk18:new-chat", onNew);
    return () => window.removeEventListener("mrk18:new-chat", onNew);
  }, [resetThread]);

  // … and /chat?new=1 — a guaranteed URL change from ANY state, so the button
  // always does something even if the event is missed
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    resetThread();
  }, [searchParams, resetThread]);

  // speak a reply aloud (Web Speech TTS), preferring an Indian-English voice
  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const v =
      voices.find((x) => /en[-_]IN/i.test(x.lang)) || voices.find((x) => /^en/i.test(x.lang));
    if (v) u.voice = v;
    u.rate = 1.02;
    window.speechSynthesis.speak(u);
  }, []);

  // pick/validate an image to attach for the CMO to analyze (vision)
  const onFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Only images can be attached — export your ad or screenshot as an image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("That image is over 5MB — attach a smaller one.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAttachment(reader.result);
        setError(null);
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const submit = useCallback(
    async (raw: string, voice = false) => {
      const text = raw.trim();
      // images only on typed turns; a turn needs text OR an image
      const img = voice ? null : attachment;
      if ((!text && !img) || sending) return;
      // out of free chats → the popup is the only way forward, not another turn
      if (quota && quota.used >= quota.cap) {
        setShowQuota(true);
        return;
      }
      setDraft("");
      setAttachment(null);
      requestAnimationFrame(resize);
      setError(null);
      setSending(true);

      const bodyText = text || "Take a look at this and give me your honest read.";
      const next: Msg[] = [
        ...messages,
        { id: `u-${Date.now()}`, role: "user", text: bodyText, image: img ?? undefined },
      ];
      setMessages(next);
      // include the image ONLY on the current (last) turn, so old images aren't
      // re-sent every turn (token + payload bloat)
      const history: Wire[] = next.map((m, i) => ({
        role: m.role === "cmo" ? "assistant" : "user",
        content: m.text,
        ...(i === next.length - 1 && m.image ? { image: m.image } : {}),
      }));

      try {
        const res = await fetch("/api/cmo/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // voice turns get a short, spoken reply; typed turns get the fuller text
          body: JSON.stringify({ messages: history.slice(-40), mode: voice ? "voice" : "text" }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && typeof data.reply === "string") {
          const full: Msg[] = [...next, { id: `c-${Date.now()}`, role: "cmo", text: data.reply }];
          setMessages(full);
          void persist(full);
          if (voice) speak(cleanCmoText(data.reply));
          // the server charged this turn → sync the counter; pop the modal the
          // instant the free allowance is spent
          if (data.usage && typeof data.usage.used === "number") {
            setQuota({ used: data.usage.used, cap: data.usage.cap, onboarded: !!data.usage.onboarded });
            if (data.usage.used >= data.usage.cap) setShowQuota(true);
          }
        } else if (res.status === 402 && data.limit_reached) {
          // backstop: the account was already at its cap. Drop the unanswered
          // turn and let the popup do the talking.
          setMessages(next.slice(0, -1));
          setQuota((q) =>
            q ? { ...q, used: q.cap } : { used: 1, cap: 1, onboarded: !!data.onboarded },
          );
          setShowQuota(true);
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
    [messages, sending, resize, persist, speak, quota, attachment],
  );

  // mic = speech-to-text only: listen, fill the input, and wait for Enter
  const toggleMic = useCallback(async () => {
    if (call !== "idle") return; // a live call owns the mic
    if (listening) {
      stopMic();
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: SRCtor;
      webkitSpeechRecognition?: SRCtor;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;

     if (!Ctor) {
         setError("Voice isn't supported in this browser — try Chrome.");
    return;
    }

// Add this line
        const SpeechRecognitionCtor: SRCtor = Ctor;
    try {
      await ensureMicPermission();
    } catch {
      setListening(false);
      recRef.current = null;
      micActiveRef.current = false;
      micFinalRef.current = "";
      setError("Allow microphone access in your browser to use voice input.");
      return;
    }

    window.speechSynthesis?.cancel();
    micActiveRef.current = true;
    micFinalRef.current = "";

    function startSession() {
      if (!micActiveRef.current) return;
      const rec = new SpeechRecognitionCtor();
      rec.lang = "en-IN";
      rec.interimResults = true;
      rec.continuous = true;
      rec.onstart = () => {
        setError(null);
        setListening(true);
        taRef.current?.focus();
      };
      rec.onresult = (e: SREvent) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) micFinalRef.current += t;
          else interim += t;
        }
        setDraft(`${micFinalRef.current}${interim}`.trim());
      };
      rec.onend = () => {
        recRef.current = null;
        setListening(false);
        if (!micActiveRef.current) {
          micFinalRef.current = "";
          return;
        }
        if (micRestartTimerRef.current !== null) {
          window.clearTimeout(micRestartTimerRef.current);
        }
        micRestartTimerRef.current = window.setTimeout(() => {
          micRestartTimerRef.current = null;
          startSession();
        }, 180);
      };
      rec.onerror = () => {
        recRef.current = null;
        setListening(false);
        micActiveRef.current = false;
        if (micRestartTimerRef.current !== null) {
          window.clearTimeout(micRestartTimerRef.current);
          micRestartTimerRef.current = null;
        }
        micFinalRef.current = "";
        setError("Mic couldn't start. Check browser mic permission and try again.");
      };
      recRef.current = rec;
      try {
        rec.start();
      } catch {
        recRef.current = null;
        setListening(false);
        micActiveRef.current = false;
        micFinalRef.current = "";
        setError("Mic couldn't start. Check browser mic permission and try again.");
      }
    }

    startSession();
  }, [call, ensureMicPermission, listening, stopMic]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(draft);
    }
  };

  const empty = messages.length === 0;

  // the live-call strip — sits right above the composer while a call is on
  const callBar = call !== "idle" && (
    <div className="mb-2 flex items-center gap-3 rounded-2xl border border-molten/25 bg-molten/[0.06] px-3.5 py-2.5">
      <button
        type="button"
        onClick={interrupt}
        disabled={phase !== "speaking"}
        aria-label={phase === "speaking" ? "Tap to interrupt" : "On a call"}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-molten to-ember text-white ${
          phase === "speaking" ? "cursor-pointer transition-transform hover:scale-105 active:scale-95" : ""
        }`}
      >
        {call === "connecting" ? (
          <span className="h-2 w-2 animate-ping rounded-full bg-white/90" aria-hidden />
        ) : phase === "speaking" ? (
          <AudioLines size={16} aria-hidden />
        ) : phase === "thinking" ? (
          <Loader2 size={15} className="animate-spin" aria-hidden />
        ) : (
          <Mic size={16} aria-hidden />
        )}
      </button>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-[13px] font-semibold text-ink">
          {call === "connecting"
            ? "Connecting to your CMO…"
            : phase === "speaking"
              ? "CMO speaking — talk over to cut in"
              : phase === "thinking"
                ? "Thinking…"
                : "Listening — go ahead"}
        </p>
        <p className="text-[11px] text-mute-2">Live voice call · saves to this chat</p>
      </div>
      <button
        type="button"
        onClick={endCall}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-ember px-3 py-1.5 text-[12px] font-bold text-white transition-opacity hover:opacity-90"
      >
        <PhoneOff size={13} aria-hidden /> End
      </button>
    </div>
  );

  const composer = (
    <div className="rounded-2xl border border-line bg-surface shadow-sm transition-colors focus-within:border-molten/40">
      {attachment && (
        <div className="flex items-center gap-2.5 px-3 pt-3">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachment}
              alt="attachment preview"
              className="h-14 w-14 rounded-lg border border-line object-cover"
            />
            <button
              type="button"
              onClick={() => setAttachment(null)}
              aria-label="Remove image"
              className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-bg shadow"
            >
              <X size={11} aria-hidden />
            </button>
          </div>
          <span className="text-[11.5px] text-mute-2">Image attached — your CMO will read it.</span>
        </div>
      )}
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
          placeholder={listening ? "Listening…" : "Message your CMO…"}
          style={{ outline: "none" }}
          className="dash-scroll max-h-40 min-h-[24px] flex-1 resize-none bg-transparent text-[14px] leading-relaxed text-ink placeholder:text-mute-2"
        />
        <button
          onClick={() => submit(draft)}
          disabled={(!draft.trim() && !attachment) || sending}
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
            onClick={() => fileRef.current?.click()}
            disabled={!vision || sending}
            title={
              vision
                ? "Attach an image — your CMO reads ads & screenshots"
                : "Image analysis unlocks with the upgraded CMO model"
            }
            className="grid h-7 w-7 place-items-center rounded-lg text-mute-2 transition-colors hover:text-ink disabled:opacity-40"
          >
            <Plus size={15} aria-hidden />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={toggleMic}
            aria-pressed={listening}
            title={listening ? "Stop listening" : "Talk to your CMO"}
            className={`grid h-7 w-7 place-items-center rounded-lg transition-colors ${
              listening ? "bg-molten/10 text-molten" : "text-mute-2 hover:text-ink"
            }`}
          >
            <Mic size={15} aria-hidden />
          </button>
        </div>
        <div className="flex items-center gap-2 pr-1 text-[11px] text-mute-2">
          {quota && extraChatsLeft !== null && (
            <span
              className={`font-data rounded-full border px-2 py-0.5 ${
                extraChatsLeft <= 1
                  ? "border-molten/40 bg-molten/10 text-molten"
                  : "border-line text-mute-2"
              }`}
            >
              {extraChatsLeft}/{quota.onboarded ? 10 : 5} {quota.onboarded ? "extra chats left" : "free chats left"}
            </span>
          )}
          {listening && (
            <span className="font-data inline-flex items-center gap-1.5 rounded-full border border-molten/30 bg-molten/10 px-2 py-0.5 text-molten">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-molten" aria-hidden />
              Mic live
            </span>
          )}
          <span className="hidden sm:inline">
            {listening ? "Listening — speak now" : "Enter to send · Shift+Enter for newline"}
          </span>
          <span className="font-data">CMO</span>
        </div>
      </div>
    </div>
  );

  // at the cap the composer is replaced by this — the only forward door is the
  // popup (onboarding for 10 more, or Founding 500 once onboarded)
  const limitBar = (
    <button
      onClick={() => setShowQuota(true)}
      className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-[13.5px] font-bold text-[color:var(--cta-ink,#fff)] shadow-sm transition-transform hover:scale-[1.01]"
      style={{ background: "var(--gradient-brand)" }}
    >
      <Lock size={15} aria-hidden />
      {quota?.onboarded
        ? "You've used your free chats — unlock more"
        : "Give your CMO full context to unlock 10 more chats"}
      <ArrowRight size={15} aria-hidden />
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      {showQuota && quota && (
        <QuotaModal
          onboarded={quota.onboarded}
          onClose={() => setShowQuota(false)}
          onAct={() => router.push(quota.onboarded ? "/pricing" : "/onboarding?from=chat")}
        />
      )}
      {/* header */}
      <header className="flex shrink-0 items-center gap-2.5 border-b border-line px-5 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-xl border border-line bg-surface">
          <Logo size={16} />
        </span>
        <div className="leading-tight">
          <p className="text-[13px] font-bold text-ink">Your CMO</p>
          <p className="flex items-center gap-1.5 text-[11px] text-mute">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-molten pulse-dot" />
            online · grounded in your company
          </p>
        </div>
      </header>

      {empty ? (
        /* empty — centered greeting + composer + word-pills (Claude-style) */
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4">
          <div className="w-full max-w-2xl">
            {/* Claude-style greeting: mark + big warm serif, straight to the point */}
            <div className="mb-9 flex items-center justify-center gap-3.5">
              <Logo size={28} className="shrink-0" />
              <h1 className="font-display text-[30px] font-medium leading-tight text-ink sm:text-[34px]">
                {greeting || " "}
              </h1>
            </div>

            {error && <p className="mb-2 px-1 text-center text-[12px] text-ember">{error}</p>}
            {callBar}
            {limitReached ? limitBar : composer}

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {PILLS.map(({ word, prompt, icon: Icon }) => (
                <button
                  key={word}
                  onClick={() => submit(prompt)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:border-molten/40 hover:bg-surface-2"
                >
                  <Icon size={14} className="text-mute-2" aria-hidden />
                  {word}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* active — thread + composer pinned to the bottom */
        <>
          <div ref={threadRef} className="dash-scroll min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 leading-relaxed ${
                      m.role === "cmo"
                        ? "font-claude-serif rounded-tl-sm border border-molten/20 bg-molten/[0.07] text-[15px] text-ink"
                        : "rounded-tr-sm bg-surface-2 text-[14px] text-ink"
                    }`}
                  >
                    {m.image && (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={m.image}
                          alt="attached"
                          className="mb-2 max-h-60 w-auto rounded-lg border border-line object-contain"
                        />
                      </>
                    )}
                    {m.role === "cmo" ? cleanCmoText(m.text) : m.text}
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
          </div>
          <div className="shrink-0 border-t border-line bg-bg px-4 py-4">
            <div className="mx-auto w-full max-w-3xl">
              {error && <p className="mb-2 px-1 text-[12px] text-ember">{error}</p>}
              {callBar}
              {limitReached ? limitBar : composer}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** The free-chat wall — a classy popup, not a dead end. Before onboarding it
 *  asks for the founder's full company context (and opens onboarding); once
 *  onboarded it points at Founding 500. */
function QuotaModal({
  onboarded,
  onClose,
  onAct,
}: {
  onboarded: boolean;
  onClose: () => void;
  onAct: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-7 text-center shadow-2xl shadow-[var(--shadow-color)]">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-mute-2 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X size={16} aria-hidden />
        </button>
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-molten/30 bg-molten/10 text-molten">
          {onboarded ? <Lock size={24} aria-hidden /> : <Brain size={24} aria-hidden />}
        </span>
        <h2 className="font-display text-[24px] leading-tight text-ink">
          {onboarded ? "You've used your free chats" : "Your CMO wants the full picture"}
        </h2>
        <p className="mx-auto mt-2.5 max-w-sm text-[13.5px] leading-relaxed text-mute">
          {onboarded ? (
            <>
              Your CMO is just getting started. <span className="font-semibold text-ink">Founding 500</span>{" "}
              unlocks unlimited chats, campaigns and the full command center — built for founders who mean it.
            </>
          ) : (
            <>
              That&apos;s your 5 free chats. Right now your CMO is guessing — give it the{" "}
              <span className="font-semibold text-ink">full context of your company</span> (who you serve, your
              edge, your goals) and it unlocks <span className="font-semibold text-ink">10 more chats</span>,
              tuned to you.
            </>
          )}
        </p>
        <button
          onClick={onAct}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[14px] font-bold text-[color:var(--cta-ink,#fff)] transition-transform hover:scale-[1.02]"
          style={{ background: "var(--gradient-brand)" }}
        >
          {onboarded ? (
            <>
              See Founding 500 <ArrowRight size={15} aria-hidden />
            </>
          ) : (
            <>
              <Sparkles size={15} aria-hidden /> Give my CMO full context
            </>
          )}
        </button>
        <button
          onClick={onClose}
          className="mt-2.5 text-[12px] font-semibold text-mute-2 transition-colors hover:text-ink"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
