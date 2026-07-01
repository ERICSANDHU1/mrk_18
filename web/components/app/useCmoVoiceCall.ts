"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cleanCmoText } from "@/lib/text";

/** The FREE live-call engine, shared by any surface that hosts a call:
 *  mic (echo-cancelled) → MediaRecorder → /api/cmo/stt (Groq Whisper) →
 *  /api/cmo/voice (the grounded CMO brain / mrk18 guide) → /api/cmo/tts
 *  (MS en-IN male neural voice, Groq male fallback, browser voice last).
 *  One 60ms volume loop does end-of-turn detection while listening and
 *  barge-in while the CMO speaks. */

export type CallState = "idle" | "connecting" | "live";
export type CallPhase = "listening" | "thinking" | "speaking";
type Wire = { role: "user" | "assistant"; content: string };

const GREETING =
  "Hey — good to actually talk. What's the one marketing thing on your mind right now?";
const ONBOARDING_PROMPT =
  "Finish onboarding to unlock your personal CMO — until then, ask me anything about mrk18.";

const TICK_MS = 60;
const BARGE_RMS = 0.03; // louder bar to cut the CMO off (its own voice is echo-cancelled)
const BARGE_FRAMES = 3; // ~180ms sustained → interrupt
const TALK_RMS = 0.015; // softer bar to count as speech while it's the founder's turn
const MIN_SPEECH_FRAMES = 3; // ~180ms of voice → they really said something
const TURN_SILENCE_FRAMES = 15; // ~900ms of quiet after speech → their turn is done
const MAX_TURN_MS = 30_000; // hard stop so a turn can't record forever

// A pure acknowledgement isn't an answer — keep the next sentence too.
const FILLER =
  /^(got it|sure|okay|ok|right|alright|great|nice|cool|absolutely|totally|yeah|yes|of course|exactly|good question|love it|makes sense|understood|gotcha|fair enough|perfect|awesome)\b/i;

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

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

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
    pool.find((v) => /en[-_]IN/i.test(v.lang) && isMaleVoice(v)) ||
    pool.find((v) => isMaleVoice(v)) ||
    pool.find((v) => /en[-_]IN/i.test(v.lang)) ||
    pool[0]
  );
}

export type UseCmoVoiceCall = {
  call: CallState;
  phase: CallPhase;
  /** Start a call. `initialHistory` seeds the brain with the ongoing chat thread. */
  connect: (initialHistory?: Wire[]) => Promise<void>;
  endCall: () => void;
  /** Founder taps to cut the CMO off while it's speaking. */
  interrupt: () => void;
};

export function useCmoVoiceCall(opts: {
  /** Fires once per spoken turn — render it wherever the call lives. */
  onTurn: (who: "founder" | "cmo", text: string) => void;
  onError?: (message: string) => void;
}): UseCmoVoiceCall {
  const [call, setCall] = useState<CallState>("idle");
  const [phase, setPhase] = useState<CallPhase>("listening");

  const onTurnRef = useRef(opts.onTurn);
  const onErrorRef = useRef(opts.onError);
  useEffect(() => {
    onTurnRef.current = opts.onTurn;
    onErrorRef.current = opts.onError;
  });

  const callRef = useRef<CallState>("idle");
  const phaseRef = useRef<CallPhase>("listening");
  const speakingRef = useRef(false);
  const wireRef = useRef<Wire[]>([]);
  const noFounderRef = useRef(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const maleVoiceRef = useRef(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const vadRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const heardRef = useRef(0);
  const quietRef = useRef(0);
  const sttFailsRef = useRef(0);
  const turnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const mimeRef = useRef("");
  const startListeningRef = useRef<() => void>(() => {});
  const turnHandlerRef = useRef<(text: string) => void>(() => {});
  const endCallRef = useRef<() => void>(() => {});

  const fail = useCallback((msg: string) => onErrorRef.current?.(msg), []);

  // preload browser voices (the last-resort TTS)
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

  const askCmo = useCallback(
    async (history: Wire[]): Promise<string | null> => {
      try {
        const res = await fetch("/api/cmo/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history.slice(-20), mode: "voice" }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && typeof data.reply === "string") {
          noFounderRef.current = false;
          return data.reply;
        }
        noFounderRef.current = res.status === 400 && /no founder/i.test(data.error || "");
        if (!noFounderRef.current) fail(data.error || "The CMO couldn't respond.");
        return null;
      } catch {
        noFounderRef.current = false;
        fail("Couldn't reach the CMO. Is the backend running?");
        return null;
      }
    },
    [fail],
  );

  /* ── speech out ──────────────────────────────────────────────────────── */
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
    u.pitch = maleVoiceRef.current ? 1.0 : 0.82;
    const finish = () => {
      if (!speakingRef.current) return;
      speakingRef.current = false;
      onDone();
    };
    u.onend = finish;
    u.onerror = finish;
    window.speechSynthesis.speak(u);
  }, []);

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
          if (!speakingRef.current) return;
          speakingRef.current = false;
          onDone();
        };
        el.onended = finish;
        el.onerror = finish;
        el.src = url;
        await el.play();
      } catch {
        browserSpeak(text, onDone);
      }
    },
    [browserSpeak],
  );

  /* ── listening (record → Whisper) ────────────────────────────────────── */
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
      fail("Recording isn't supported in this browser.");
      return;
    }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    rec.onstop = async () => {
      if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
      recorderRef.current = null;
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
        if (callRef.current !== "live") return;
        if (!res.ok) {
          if (++sttFailsRef.current >= 3) {
            fail(
              typeof data.error === "string"
                ? data.error
                : "The call can't reach the CMO right now — try again in a minute.",
            );
            endCallRef.current();
            return;
          }
          startListeningRef.current();
          return;
        }
        sttFailsRef.current = 0;
        const text = typeof data.text === "string" ? data.text.trim() : "";
        if (!text) {
          startListeningRef.current();
          return;
        }
        turnHandlerRef.current(text);
      } catch {
        if (callRef.current !== "live") return;
        if (++sttFailsRef.current >= 3) {
          fail("The call can't reach the CMO right now — try again in a minute.");
          endCallRef.current();
          return;
        }
        startListeningRef.current();
      }
    };
    recorderRef.current = rec;
    rec.start();
    turnTimerRef.current = setTimeout(() => {
      if (recorderRef.current === rec && rec.state === "recording") rec.stop();
    }, MAX_TURN_MS);
  }, [fail]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

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

  const interrupt = useCallback(() => {
    if (callRef.current !== "live" || !speakingRef.current) return;
    speakingRef.current = false;
    try {
      audioElRef.current?.pause();
    } catch {
      /* no audio element yet */
    }
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    startListening();
  }, [startListening]);

  /* ── one volume loop: barge-in while speaking, endpointing while listening ── */
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
        let hot = 0;
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

  /* ── turns ───────────────────────────────────────────────────────────── */
  const handleFounderTurn = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean || callRef.current !== "live") return;
      onTurnRef.current("founder", clean);
      wireRef.current = [...wireRef.current, { role: "user", content: clean }];
      setPhase("thinking");
      phaseRef.current = "thinking";
      askCmo(wireRef.current).then((reply) => {
        if (callRef.current !== "live") return;
        const raw =
          reply ??
          (noFounderRef.current
            ? ONBOARDING_PROMPT
            : "Sorry — I didn't catch that. Say it again?");
        const say = oneLine(raw);
        onTurnRef.current("cmo", say);
        wireRef.current = [...wireRef.current, { role: "assistant", content: say }];
        speak(say, startListening);
      });
    },
    [askCmo, speak, startListening],
  );

  useEffect(() => {
    turnHandlerRef.current = handleFounderTurn;
  }, [handleFounderTurn]);

  /* ── lifecycle ───────────────────────────────────────────────────────── */
  const connect = useCallback(
    async (initialHistory?: Wire[]) => {
      if (callRef.current !== "idle") return; // one call at a time
      mimeRef.current = pickMime();
      if (!mimeRef.current || !navigator.mediaDevices?.getUserMedia) {
        fail("Voice calls need a modern browser.");
        return;
      }
      setCall("connecting");
      callRef.current = "connecting";
      try {
        micStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        fail("Microphone blocked — allow mic access and try again.");
        setCall("idle");
        callRef.current = "idle";
        return;
      }
      setupVad(micStreamRef.current);
      sttFailsRef.current = 0;
      wireRef.current = [...(initialHistory ?? []).slice(-16)];
      setCall("live");
      callRef.current = "live";
      // the CMO speaks first — instant, templated, zero API wait — then listens
      onTurnRef.current("cmo", GREETING);
      wireRef.current = [...wireRef.current, { role: "assistant", content: GREETING }];
      speak(GREETING, startListening);
    },
    [fail, setupVad, speak, startListening],
  );

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
    setCall("idle");
    callRef.current = "idle";
    setPhase("listening");
    phaseRef.current = "listening";
  }, [stopRecorder, teardownVad]);

  useEffect(() => {
    endCallRef.current = endCall;
  }, [endCall]);

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

  return { call, phase, connect, endCall, interrupt };
}
