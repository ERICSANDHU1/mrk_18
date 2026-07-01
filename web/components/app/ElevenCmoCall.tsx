"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { AnimatePresence, motion } from "framer-motion";
import { AudioLines, Mic, PhoneOff } from "lucide-react";
import Logo from "@/components/app/Logo";

// Set these in .env.local to switch the CMO call over to ElevenLabs Agents.
const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
const VOICE_ID = process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID; // optional male-voice override

type Turn = { who: "cmo" | "founder"; text: string };

/** Best-effort grounding: a compact brief of the founder's business, injected into
 *  the agent's prompt so the CMO talks about THEIR company (needs prompt overrides
 *  enabled on the agent; otherwise the agent's own dashboard prompt is used). */
async function founderBrief(): Promise<string> {
  try {
    const r = await fetch("/api/me/profile", { cache: "no-store" });
    if (!r.ok) return "";
    const d = await r.json();
    const p = (d?.profile ?? {}) as Record<string, unknown>;
    const bits: string[] = [];
    const push = (label: string, v: unknown) => {
      if (v) bits.push(`${label}: ${v}`);
    };
    push("Company", p.company_name);
    push("What they do", p.product_description);
    push("Who they serve", p.icp);
    push("Primary goal", p.primary_goal);
    if (p.monthly_spend_inr) bits.push(`Monthly budget: ₹${p.monthly_spend_inr}`);
    return bits.join(". ");
  } catch {
    return "";
  }
}

function CallInner() {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const startingRef = useRef(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const conv = useConversation({
    onError: (message: string) => setError(message || "The call hit an error."),
    onDisconnect: () => {
      startingRef.current = false;
      setActive(false);
    },
    onMessage: (m: { message: string; source: "user" | "ai" }) => {
      if (!m?.message) return;
      setTranscript((t) => [...t, { who: m.source === "user" ? "founder" : "cmo", text: m.message }]);
    },
  });

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [transcript]);

  const start = useCallback(async () => {
    if (!AGENT_ID || startingRef.current || conv.status !== "disconnected") return;
    startingRef.current = true;
    setError(null);
    setTranscript([]);
    setActive(true);
    const brief = await founderBrief();
    try {
      conv.startSession({
        agentId: AGENT_ID,
        connectionType: "webrtc", // real-time voice — ElevenLabs handles STT, TTS + barge-in
        overrides: {
          ...(brief
            ? {
                agent: {
                  prompt: {
                    prompt:
                      "You are the founder's AI Chief Marketing Officer on a live voice call — sharp, warm, decisive, India-first (rupees, Indian platforms). Keep every turn to one or two short spoken sentences; it's a real back-and-forth, not a memo. Ground everything in THEIR business: " +
                      brief +
                      ".",
                  },
                },
              }
            : {}),
          ...(VOICE_ID ? { tts: { voiceId: VOICE_ID } } : {}),
        },
      });
    } catch {
      setError("Couldn't start the call — check mic permission and try again.");
      setActive(false);
      startingRef.current = false;
    }
  }, [conv]);

  const end = useCallback(() => {
    try {
      conv.endSession();
    } catch {
      /* noop */
    }
    startingRef.current = false;
    setActive(false);
  }, [conv]);

  // The concierge "Yes" and CmoPanel's "Call CMO" button both dispatch this event.
  useEffect(() => {
    const onCall = () => start();
    window.addEventListener("mrk18:cmo-call", onCall);
    return () => window.removeEventListener("mrk18:cmo-call", onCall);
  }, [start]);

  const connecting = conv.status === "connecting" || (active && conv.status === "disconnected" && !error);
  const speaking = conv.isSpeaking;
  const statusLabel = error
    ? "Couldn't connect"
    : connecting
      ? "Connecting to your CMO…"
      : speaking
        ? "Speaking…"
        : "Listening — just talk";

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="eleven-call"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ y: 16, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 12, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="flex w-[380px] max-w-[92vw] flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl shadow-[var(--shadow-color)]"
          >
            <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-xl border border-line bg-surface">
                  <Logo width={18} height={14} />
                </span>
                <div className="leading-tight">
                  <p className="text-[13px] font-bold text-ink">Your CMO</p>
                  <p className="flex items-center gap-1.5 text-[11px] text-mute">
                    <span aria-hidden className="pulse-dot h-1.5 w-1.5 rounded-full bg-molten" />
                    {conv.status === "connected" ? "on a call" : "connecting"}
                  </p>
                </div>
              </div>
            </header>

            <div className="flex flex-col items-center px-5 py-6">
              <div className="relative grid h-32 w-32 place-items-center">
                {(connecting || speaking) && (
                  <>
                    <span aria-hidden className="ring absolute inset-0 rounded-full border border-molten/40" />
                    <span aria-hidden className="ring absolute inset-1 rounded-full border border-molten/30" style={{ animationDelay: "0.6s" }} />
                  </>
                )}
                {!connecting && !speaking && (
                  <span aria-hidden className="pulse-dot absolute inset-0 rounded-full bg-molten/10" />
                )}
                <span
                  aria-hidden
                  className={`grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-molten to-ember text-white shadow-lg shadow-[var(--shadow-color)] ${speaking ? "orb" : ""}`}
                >
                  {connecting ? (
                    <span className="h-2.5 w-2.5 animate-ping rounded-full bg-white/90" />
                  ) : speaking ? (
                    <AudioLines size={26} aria-hidden />
                  ) : (
                    <Mic size={26} aria-hidden />
                  )}
                </span>
              </div>
              <p className="mt-5 text-[13px] font-semibold text-ink">{statusLabel}</p>
              {error ? (
                <p className="mt-1 max-w-[280px] text-center text-[11px] text-ember">{error}</p>
              ) : (
                <p className="mt-1 text-[11px] text-mute-2">Talk over the CMO any time — it&apos;ll stop and listen.</p>
              )}
            </div>

            {transcript.length > 0 && (
              <div ref={threadRef} className="dash-scroll mx-5 mb-3 max-h-40 space-y-1.5 overflow-y-auto">
                {transcript.map((t, i) => (
                  <p key={i} className="text-[12px] leading-snug">
                    <span className={`font-data text-[10px] ${t.who === "cmo" ? "text-molten" : "text-mute-2"}`}>
                      {t.who === "cmo" ? "CMO" : "You"}
                      {" · "}
                    </span>
                    <span className="text-ink/90">{t.text}</span>
                  </p>
                ))}
              </div>
            )}

            <div className="border-t border-line p-4">
              <button
                onClick={end}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-ember py-2.5 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
              >
                <PhoneOff size={15} aria-hidden /> End call
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * ElevenLabs Agents voice call — active ONLY when NEXT_PUBLIC_ELEVENLABS_AGENT_ID is
 * set. It replaces the browser Web-Speech call (CmoPanel) with ElevenLabs' Scribe
 * speech-to-text, a chosen male voice, and native barge-in. When the env var is
 * absent this renders nothing and CmoPanel's built-in call is used instead.
 */
export default function ElevenCmoCall() {
  if (!AGENT_ID) return null;
  return (
    <ConversationProvider>
      <CallInner />
    </ConversationProvider>
  );
}
