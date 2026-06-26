"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Pick a natural en-IN voice when available (Web Speech fallback only). */
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

export type Narrator = {
  /** Speak `text`, tagging it with `id` so the matching <TermText id> highlights. */
  narrate: (text: string, id: string) => void;
  /** Instantly stop speaking and clear the highlight. */
  stop: () => void;
  speaking: boolean;
  /** Which text block is being narrated right now (null = none). */
  activeId: string | null;
  /** Character index of the word currently being spoken, within the active text. */
  charIndex: number;
  /** Whether any narration engine is available in this browser. */
  supported: boolean;
};

type Alignment = {
  characters?: string[];
  character_start_times_seconds?: number[];
  character_end_times_seconds?: number[];
};

/** CMO narration with karaoke word-highlighting + barge-in.
 *  Primary engine: ElevenLabs (premium voice + precise per-word timing, works in
 *  every browser) via the /api/tts proxy. Falls back to the free browser Web
 *  Speech API when no ElevenLabs key is configured. Either way it reports the
 *  currently-spoken character via `charIndex`, so the UI highlighting is
 *  engine-agnostic. */
export function useNarrator(): Narrator {
  const [speaking, setSpeaking] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [charIndex, setCharIndex] = useState(-1);

  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const stoppedRef = useRef(false);
  const beatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  // ElevenLabs availability: null = untried, true = use it, false = key absent → Web Speech
  const elevenRef = useRef<boolean | null>(null);

  const supported =
    typeof window !== "undefined" && ("speechSynthesis" in window || typeof Audio !== "undefined");

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

  const teardown = () => {
    if (beatRef.current) {
      clearInterval(beatRef.current);
      beatRef.current = null;
    }
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.src = "";
      } catch {
        /* noop */
      }
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  };

  const stop = useCallback(() => {
    stoppedRef.current = true;
    teardown();
    setSpeaking(false);
    setActiveId(null);
    setCharIndex(-1);
  }, []);

  const finish = useCallback((id: string) => {
    teardown();
    setSpeaking(false);
    setCharIndex(-1);
    setActiveId((cur) => (cur === id ? null : cur));
  }, []);

  // ── Free Web Speech fallback ──────────────────────────────────────────────
  const speakWeb = useCallback(
    (text: string, id: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        finish(id);
        return;
      }
      window.speechSynthesis.cancel();
      setTimeout(() => {
        if (stoppedRef.current) return;
        const u = new SpeechSynthesisUtterance(text);
        if (voiceRef.current) u.voice = voiceRef.current;
        u.rate = 1.0;
        u.pitch = 1.0;
        u.onboundary = (e) => {
          if (!stoppedRef.current && typeof e.charIndex === "number") setCharIndex(e.charIndex);
        };
        u.onend = () => finish(id);
        u.onerror = () => finish(id);
        window.speechSynthesis.speak(u);
        beatRef.current = setInterval(() => {
          if (stoppedRef.current || !window.speechSynthesis.speaking) return;
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }, 10_000);
      }, 0);
    },
    [finish],
  );

  // ── ElevenLabs: play audio + drive highlight off per-char timestamps ───────
  const playEleven = useCallback(
    (id: string, text: string, audioB64: string, align: Alignment) => {
      const starts = align.character_start_times_seconds;
      const audio = new Audio(`data:audio/mpeg;base64,${audioB64}`);
      audioRef.current = audio;
      audio.onended = () => finish(id);
      audio.onerror = () => finish(id);

      let i = 0;
      const tick = () => {
        if (stoppedRef.current || !audioRef.current) return;
        const t = audioRef.current.currentTime;
        if (starts && starts.length) {
          while (i + 1 < starts.length && starts[i + 1] <= t) i++;
          setCharIndex(i); // index into the SAME text we sent → maps to a TermText token
        }
        rafRef.current = requestAnimationFrame(tick);
      };

      audio.play().then(
        () => {
          if (stoppedRef.current) return;
          rafRef.current = requestAnimationFrame(tick);
        },
        () => {
          // autoplay blocked / decode error → fall back to the free voice
          if (!stoppedRef.current) speakWeb(text, id);
        },
      );
    },
    [finish, speakWeb],
  );

  const narrate = useCallback(
    (text: string, id: string) => {
      if (!supported || !text.trim()) return;
      stoppedRef.current = false;
      teardown();
      setActiveId(id);
      setCharIndex(-1);
      setSpeaking(true);

      // Known no ElevenLabs key → straight to Web Speech.
      if (elevenRef.current === false) {
        speakWeb(text, id);
        return;
      }

      (async () => {
        try {
          const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          });
          if (res.status === 503) {
            elevenRef.current = false; // not configured — stop trying
            throw new Error("tts not configured");
          }
          if (!res.ok) throw new Error("tts error");
          const data = await res.json();
          if (stoppedRef.current) return;
          if (!data?.audio_base64 || !data?.alignment) throw new Error("bad tts response");
          elevenRef.current = true;
          playEleven(id, text, data.audio_base64, data.alignment as Alignment);
        } catch {
          if (stoppedRef.current) return;
          speakWeb(text, id); // graceful fallback to free voice
        }
      })();
    },
    [supported, speakWeb, playEleven],
  );

  // stop on unmount so a navigated-away page never keeps talking
  useEffect(() => stop, [stop]);

  return { narrate, stop, speaking, activeId, charIndex, supported };
}
