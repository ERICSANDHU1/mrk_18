"use client";

import Logo from "@/components/app/Logo";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AudioLines, Mic, Phone, PhoneOff, Send, X } from "lucide-react";
import type { ChatMsg } from "@/lib/mock/console";
import { cleanCmoText } from "@/lib/text";

type CallState = "idle" | "connecting" | "live";
type Phase = "listening" | "thinking" | "speaking";
type Turn = { who: "cmo" | "founder"; text: string };
type Wire = { role: "user" | "assistant"; content: string };

const GREETING =
  "Hey — good to actually talk. What's the one marketing thing on your mind right now?";
const ONBOARDING_PROMPT =
  "Complete your onboarding first — your CMO activates once your workspace is set up.";
// When an ElevenLabs agent is configured, ElevenCmoCall handles the live voice call;
// this panel just routes to it. Without it, the FREE engine below runs the call:
// mic → Groq Whisper (STT) → the grounded CMO brain → MS/Groq male voice (TTS).
const ELEVEN = !!process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;

// One 60ms volume loop (on an echo-cancelled mic) drives the whole conversation:
// while the CMO speaks it detects barge-in; while listening it detects when the
// founder starts and stops talking (endpointing).
const TICK_MS = 60;
const BARGE_RMS = 0.03; // louder bar to cut the CMO off (its own voice is echo-cancelled)
const BARGE_FRAMES = 3; // ~180ms sustained → interrupt
const TALK_RMS = 0.015; // softer bar to count as speech while it's the founder's turn
const MIN_SPEECH_FRAMES = 3; // ~180ms of voice → they really said something
const TURN_SILENCE_FRAMES = 15; // ~900ms of quiet after speech → their turn is done
const MAX_TURN_MS = 30_000; // hard stop so a turn can't record forever

// Best supported MediaRecorder container (Chrome/Edge/Firefox → webm; Safari → mp4).
function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

// A pure acknowledgement ("Got it.", "Sure.") isn't an answer on its own — if the
// CMO opens with one, we keep the next sentence too so the spoken line has substance.
const FILLER = /^(got it|sure|okay|ok|right|alright|great|nice|cool|absolutely|totally|yeah|yes|of course|exactly|good question|love it|makes sense|understood|gotcha|fair enough|perfect|awesome)\b/i;

// On a call the CMO speaks ONE short line: strip markdown, then keep the first
// real sentence (plus a follow-on if the first is just filler).
function oneLine(text: string): string {
  const clean = cleanCmoText(text).replace(/\s+/g, " ").trim();
  if (!clean) return clean;
  const parts = clean.match(/[^.!?]+[.!?]?/g) || [clean];
  let out = (parts[0] || "").trim();
  if (parts[1] && (out.length < 40 || FILLER.test(out))) {
    out = `${out} ${parts[1].trim()}`.trim();
  }
  if (out.length > 240) out = `${out.slice(0, 237).trimEnd()}…`;
  return out || clean;
}

// Known male voice names across Windows / macOS / Chrome (voices don't expose a
// gender flag, so we match by name).
const MALE_VOICE =
  /(ravi|hemant|prabhat|david|mark|guy|christopher|brian|eric|alex|daniel|rishi|aaron|fred|george|james|tom|oliver|arthur|ryan)/i;

function isMaleVoice(v: SpeechSynthesisVoice): boolean {
  if (/\bfemale\b/i.test(v.name)) return false;
  return /\bmale\b/i.test(v.name) || MALE_VOICE.test(v.name);
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const en = voices.filter((v) => /^en/i.test(v.lang));
  const pool = en.length ? en : voices;
  return (
    pool.find((v) => /en[-_]IN/i.test(v.lang) && isMaleVoice(v)) || // Indian-English male — ideal
    pool.find((v) => isMaleVoice(v)) || // any English male voice
    pool.find((v) => /en[-_]IN/i.test(v.lang)) || // Indian English (any)
    pool[0]
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
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  // refs that callbacks read (state is stale inside recorder/audio handlers)
  const callRef = useRef<CallState>("idle");
  const speakingRef = useRef(false);
  const wireRef = useRef<Wire[]>([]); // running [{role,content}] sent to the backend
  const noFounderRef = useRef(false); // last askCmo failed because there's no workspace yet
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null); // browser-TTS fallback voice
  const maleVoiceRef = useRef(false); // is the chosen fallback voice already male?
  const phaseRef = useRef<Phase>("listening"); // handlers read the latest phase
  // the free voice engine: an echo-cancelled mic stream + one volume loop that
  // detects both barge-in (while speaking) and end-of-turn (while listening)
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const vadRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null); // records the founder's turn
  const heardRef = useRef(0); // speech frames heard this turn
  const quietRef = useRef(0); // consecutive silence frames after speech
  const turnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null); // plays the CMO's voice
  const mimeRef = useRef(""); // recorder container picked at connect time

  useEffect(() => {
    callRef.current = call;
  }, [call]);

  // Tell the app shell to make room while the panel is open: it collapses the left
  // rail and pads the content so the drawer never overlaps the page.
  useEffect(() => {
    window.dispatchEvent(new Event(open ? "mrk18:cmo-open" : "mrk18:cmo-closed"));
  }, [open]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages]);

  // preload TTS voices (they populate asynchronously)
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const load = () => {
      const v = pickVoice();
      voiceRef.current = v;
      maleVoiceRef.current = v ? isMaleVoice(v) : false;
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  /* ── one shared call to the CMO brain ─────────────────────────────────── */
  const askCmo = useCallback(
    async (history: Wire[], mode: "voice" | "text" = "voice"): Promise<string | null> => {
    try {
      const res = await fetch("/api/cmo/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-20), mode }),
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
  // last resort: the browser's own voice (male-picked) if the backend TTS is down
  const browserSpeak = useCallback((text: string, onDone: () => void) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      speakingRef.current = false;
      onDone();
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voiceRef.current) u.voice = voiceRef.current;
    u.rate = 1.02;
    u.pitch = maleVoiceRef.current ? 1.0 : 0.82; // read as male even without a male voice
    const finish = () => {
      if (!speakingRef.current) return; // already interrupted (founder cut in)
      speakingRef.current = false;
      onDone();
    };
    u.onend = finish;
    u.onerror = finish; // never strand the call if TTS hiccups
    window.speechSynthesis.speak(u);
  }, []);

  // The CMO's real voice: backend TTS (free MS en-IN male neural voice, Groq male
  // fallback) played through an <audio> element — instantly pausable for barge-in.
  const speak = useCallback(
    async (text: string, onDone: () => void) => {
      speakingRef.current = true;
      setPhase("speaking");
      phaseRef.current = "speaking";
      try {
        const res = await fetch("/api/cmo/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error("tts unavailable");
        const blob = await res.blob();
        if (!speakingRef.current) return; // interrupted while the audio was being made
        const url = URL.createObjectURL(blob);
        const el = audioElRef.current ?? new Audio();
        audioElRef.current = el;
        const finish = () => {
          URL.revokeObjectURL(url);
          if (!speakingRef.current) return; // interrupted mid-playback
          speakingRef.current = false;
          onDone();
        };
        el.onended = finish;
        el.onerror = finish;
        el.src = url;
        await el.play();
      } catch {
        browserSpeak(text, onDone); // still speaks — just with the browser's voice
      }
    },
    [browserSpeak],
  );

  /* ── listening (record the turn → Groq Whisper transcribes it) ─────────── */
  // set below once their targets exist — breaks the listen→turn→speak→listen cycle
  const startListeningRef = useRef<() => void>(() => {});
  const turnHandlerRef = useRef<(text: string) => void>(() => {});

  const startListening = useCallback(() => {
    if (callRef.current !== "live" || speakingRef.current) return;
    const stream = micStreamRef.current;
    if (!stream || recorderRef.current?.state === "recording") return;
    heardRef.current = 0;
    quietRef.current = 0;
    setPhase("listening");
    phaseRef.current = "listening";
    let rec: MediaRecorder;
    try {
      rec = mimeRef.current
        ? new MediaRecorder(stream, { mimeType: mimeRef.current })
        : new MediaRecorder(stream);
    } catch {
      setError("Recording isn't supported in this browser.");
      return;
    }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    rec.onstop = async () => {
      if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
      recorderRef.current = null;
      // ended mid-listen (endCall / barge path reset) → nothing to transcribe
      if (callRef.current !== "live" || phaseRef.current !== "listening") return;
      const blob = new Blob(chunks, { type: rec.mimeType || mimeRef.current || "audio/webm" });
      if (heardRef.current < MIN_SPEECH_FRAMES || blob.size < 1000) {
        startListeningRef.current(); // heard nothing real — keep listening
        return;
      }
      setPhase("thinking");
      phaseRef.current = "thinking";
      try {
        const res = await fetch("/api/cmo/stt", {
          method: "POST",
          headers: { "Content-Type": blob.type },
          body: blob,
        });
        const data = await res.json().catch(() => ({}));
        const text = res.ok && typeof data.text === "string" ? data.text.trim() : "";
        if (callRef.current !== "live") return;
        if (!text) {
          startListeningRef.current(); // couldn't make out words — listen again
          return;
        }
        turnHandlerRef.current(text);
      } catch {
        if (callRef.current === "live") startListeningRef.current();
      }
    };
    recorderRef.current = rec;
    rec.start();
    turnTimerRef.current = setTimeout(() => {
      if (recorderRef.current === rec && rec.state === "recording") rec.stop();
    }, MAX_TURN_MS);
  }, []);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  // the volume loop decided the founder finished talking → flush the recording
  // (its onstop transcribes and hands the text to the turn handler)
  const finishTurn = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state === "recording") {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    }
  }, []);

  // abandon any in-flight recording without transcribing it (endCall)
  const stopRecorder = useCallback(() => {
    if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
    const rec = recorderRef.current;
    recorderRef.current = null;
    try {
      if (rec && rec.state !== "inactive") rec.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  // founder cuts in (talks over the CMO, or taps the orb) → stop the CMO's voice
  // immediately and hand them the turn.
  const interrupt = useCallback(() => {
    if (callRef.current !== "live" || !speakingRef.current) return;
    speakingRef.current = false; // the audio's onended no-ops (no double-listen)
    try {
      audioElRef.current?.pause();
    } catch {
      /* no audio element yet */
    }
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    startListening();
  }, [startListening]);

  // One 60ms loop on the echo-cancelled mic drives the conversation:
  // • CMO speaking → founder's voice sustained ~180ms = barge-in → interrupt()
  // • founder's turn → speech followed by ~900ms of quiet = turn done → finishTurn()
  const setupVad = useCallback(
    (stream: MediaStream) => {
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        ctx.resume?.();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        audioCtxRef.current = ctx;
        const buf = new Float32Array(analyser.fftSize);
        let hot = 0; // sustained-voice frames while the CMO is talking
        vadRef.current = setInterval(() => {
          if (callRef.current !== "live") {
            hot = 0;
            return;
          }
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);

          if (speakingRef.current) {
            // CMO talking — listen for the founder cutting in
            if (rms > BARGE_RMS) {
              hot += 1;
              if (hot >= BARGE_FRAMES) {
                hot = 0;
                interrupt();
              }
            } else {
              hot = 0;
            }
            return;
          }
          hot = 0;

          // founder's turn — endpointing on the live recording
          if (phaseRef.current !== "listening" || recorderRef.current?.state !== "recording") return;
          if (rms > TALK_RMS) {
            heardRef.current += 1;
            quietRef.current = 0;
          } else if (heardRef.current >= MIN_SPEECH_FRAMES) {
            quietRef.current += 1;
            if (quietRef.current >= TURN_SILENCE_FRAMES) finishTurn();
          }
        }, TICK_MS);
      } catch {
        /* WebAudio unavailable — tap-to-interrupt still works; turns end at MAX_TURN_MS */
      }
    },
    [interrupt, finishTurn],
  );

  const teardownVad = useCallback(() => {
    if (vadRef.current) {
      clearInterval(vadRef.current);
      vadRef.current = null;
    }
    try {
      audioCtxRef.current?.close();
    } catch {
      /* noop */
    }
    audioCtxRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
  }, []);

  // founder finished a turn → send it, speak the (one-line) reply, then listen again
  const handleFounderTurn = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean || callRef.current !== "live") return;
      setTranscript((t) => [...t, { who: "founder", text: clean }]);
      wireRef.current = [...wireRef.current, { role: "user", content: clean }];
      setPhase("thinking");
      phaseRef.current = "thinking";
      askCmo(wireRef.current, "voice").then((reply) => {
        if (callRef.current !== "live") return;
        const raw =
          reply ??
          (noFounderRef.current
            ? ONBOARDING_PROMPT
            : "Sorry — I didn't catch that. Say it again?");
        const say = oneLine(raw); // a short spoken line — conversational, not a memo
        setTranscript((t) => [...t, { who: "cmo", text: say }]);
        wireRef.current = [...wireRef.current, { role: "assistant", content: say }];
        speak(say, startListening);
      });
    },
    [askCmo, speak, startListening],
  );

  // the recorder's onstop hands the transcribed turn to the latest handler
  useEffect(() => {
    turnHandlerRef.current = handleFounderTurn;
  }, [handleFounderTurn]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  /* ── call lifecycle ───────────────────────────────────────────────────── */
  const connect = useCallback(async () => {
    setError(null);
    mimeRef.current = pickMime();
    if (!mimeRef.current || !navigator.mediaDevices?.getUserMedia) {
      setError("Voice calls need a modern browser. Use the text box below for now.");
      return;
    }
    setCall("connecting");
    callRef.current = "connecting";
    try {
      // one echo-cancelled mic stream powers the whole call: the turn recorder
      // AND the volume loop (barge-in + end-of-turn detection).
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setError("Microphone blocked — allow mic access and try again.");
      setCall("idle");
      callRef.current = "idle";
      return;
    }
    setupVad(micStreamRef.current);
    wireRef.current = [];
    setTranscript([]);
    setCall("live");
    callRef.current = "live";
    // the CMO speaks first — instant, templated, zero API wait — then listens
    setTranscript([{ who: "cmo", text: GREETING }]);
    wireRef.current = [{ role: "assistant", content: GREETING }];
    speak(GREETING, startListening);
  }, [speak, startListening, setupVad]);

  const endCall = useCallback(() => {
    stopRecorder();
    teardownVad();
    speakingRef.current = false;
    try {
      audioElRef.current?.pause();
    } catch {
      /* no audio element */
    }
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    const turns = transcript.length;
    setCall("idle");
    callRef.current = "idle";
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
  }, [stopRecorder, teardownVad, transcript.length]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecorder();
      try {
        audioElRef.current?.pause();
      } catch {
        /* noop */
      }
      if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
      teardownVad();
    };
  }, [stopRecorder, teardownVad]);

  // the concierge greeting's "Yes" → open the panel and start a live call
  useEffect(() => {
    const onCall = () => {
      if (ELEVEN) return; // ElevenCmoCall handles the live call when configured
      setOpen(true);
      connect();
    };
    window.addEventListener("mrk18:cmo-call", onCall);
    return () => window.removeEventListener("mrk18:cmo-call", onCall);
  }, [connect]);

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
    const reply = await askCmo(history, "text");
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
              {/* orb — tap while the CMO is speaking to cut in */}
              <div className="flex flex-1 flex-col items-center justify-center">
                <button
                  type="button"
                  onClick={interrupt}
                  disabled={phase !== "speaking"}
                  aria-label={phase === "speaking" ? "Tap to interrupt" : "On a call"}
                  className={`relative grid h-32 w-32 place-items-center rounded-full transition-transform duration-200 ${
                    phase === "speaking" ? "cursor-pointer hover:scale-[1.03] active:scale-95" : "cursor-default"
                  }`}
                >
                  {(call === "connecting" || phase === "speaking") && (
                    <>
                      <span aria-hidden className="ring absolute inset-0 rounded-full border border-molten/40" />
                      <span aria-hidden className="ring absolute inset-1 rounded-full border border-molten/30" style={{ animationDelay: "0.6s" }} />
                    </>
                  )}
                  {call === "live" && phase === "listening" && (
                    <span aria-hidden className="pulse-dot absolute inset-0 rounded-full bg-molten/10" />
                  )}
                  <span
                    aria-hidden
                    className={`grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-molten to-ember text-white shadow-lg shadow-[var(--shadow-color)] ${
                      call === "live" && phase === "speaking" ? "orb" : ""
                    }`}
                  >
                    {call === "connecting" ? (
                      <span className="h-2.5 w-2.5 animate-ping rounded-full bg-white/90" />
                    ) : phase === "listening" ? (
                      <Mic size={26} aria-hidden />
                    ) : phase === "thinking" ? (
                      <span className="flex gap-1">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/90" style={{ animationDelay: "0ms" }} />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/90" style={{ animationDelay: "150ms" }} />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/90" style={{ animationDelay: "300ms" }} />
                      </span>
                    ) : (
                      <AudioLines size={26} aria-hidden />
                    )}
                  </span>
                </button>
                <p className="mt-5 text-[13px] font-semibold text-ink">{statusLabel}</p>
                <p className="mt-1 h-4 text-[11px] text-mute-2">
                  {phase === "speaking"
                    ? "Just talk to cut in — or tap the orb"
                    : phase === "listening"
                      ? "Listening — go ahead"
                      : ""}
                </p>
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
                  {phase === "thinking" && (
                    <p className="text-[12px] leading-snug opacity-60">
                      <span className="font-data text-[10px] text-mute-2">CMO · </span>
                      <span className="text-ink/70">thinking…</span>
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
            onClick={ELEVEN ? () => window.dispatchEvent(new Event("mrk18:cmo-call")) : connect}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-molten py-2.5 text-[13px] font-extrabold text-white transition-opacity duration-200 hover:opacity-90"
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
