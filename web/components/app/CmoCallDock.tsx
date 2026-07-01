"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AudioLines, Loader2, Mic, PhoneOff, X } from "lucide-react";
import Logo from "@/components/app/Logo";
import { useCmoVoiceCall } from "@/components/app/useCmoVoiceCall";

type Turn = { who: "founder" | "cmo"; text: string };

/** The floating live-call dock for pages OUTSIDE Chat (Comrk, Chief, …):
 *  "Yes, let's talk" starts the call right here — no navigation. On the Chat
 *  page the call renders into the real thread instead (ChatClient). */
export default function CmoCallDock() {
  const [active, setActive] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const onTurn = useCallback((who: "founder" | "cmo", text: string) => {
    setTurns((t) => [...t, { who, text }]);
  }, []);

  const { call, phase, connect, endCall, interrupt } = useCmoVoiceCall({
    onTurn,
    onError: setError,
  });

  // auto-scroll the mini transcript as turns land
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  // the concierge "Yes" (and the drawer's Call CMO) on non-chat pages land here
  useEffect(() => {
    const onCall = () => {
      setError(null);
      setTurns([]);
      setActive(true);
      void connect();
    };
    window.addEventListener("mrk18:cmo-call-dock", onCall);
    return () => window.removeEventListener("mrk18:cmo-call-dock", onCall);
  }, [connect]);

  const hangUp = useCallback(() => {
    endCall();
    setActive(false);
  }, [endCall]);

  const statusLabel = error
    ? "Call hit a problem"
    : call === "connecting"
      ? "Connecting to your CMO…"
      : phase === "speaking"
        ? "Speaking — talk over to cut in"
        : phase === "thinking"
          ? "Thinking…"
          : "Listening — go ahead";

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="cmo-call-dock"
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-5 right-5 z-50 w-[330px] max-w-[88vw]"
        >
          <div className="overflow-hidden rounded-2xl border border-molten/25 bg-surface shadow-2xl shadow-[var(--shadow-color)]">
            <span aria-hidden className="block h-[2.5px] bg-gradient-to-r from-molten to-ember" />

            {/* header */}
            <div className="flex items-center gap-2.5 px-4 pt-3">
              <span className="grid h-8 w-8 place-items-center rounded-xl border border-line bg-surface">
                <Logo width={18} height={14} />
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-[12.5px] font-bold text-ink">Your CMO</p>
                <p className="flex items-center gap-1.5 text-[10.5px] text-mute">
                  <span aria-hidden className="pulse-dot h-1.5 w-1.5 rounded-full bg-molten" />
                  {call === "live" ? "on a call" : "connecting"}
                </p>
              </div>
              <button
                onClick={hangUp}
                aria-label="End call and close"
                className="grid h-6 w-6 place-items-center rounded-md text-mute-2 transition-colors hover:bg-[var(--overlay-subtle)] hover:text-ink"
              >
                <X size={14} aria-hidden />
              </button>
            </div>

            {/* orb + status */}
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={interrupt}
                disabled={phase !== "speaking"}
                aria-label={phase === "speaking" ? "Tap to interrupt" : "On a call"}
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-molten to-ember text-white ${
                  phase === "speaking"
                    ? "cursor-pointer transition-transform hover:scale-105 active:scale-95"
                    : ""
                }`}
              >
                {call === "connecting" ? (
                  <span className="h-2 w-2 animate-ping rounded-full bg-white/90" aria-hidden />
                ) : phase === "speaking" ? (
                  <AudioLines size={18} aria-hidden />
                ) : phase === "thinking" ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                ) : (
                  <Mic size={18} aria-hidden />
                )}
              </button>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-[13px] font-semibold text-ink">{statusLabel}</p>
                {error ? (
                  <p className="mt-0.5 text-[11px] leading-snug text-ember">{error}</p>
                ) : (
                  <p className="text-[11px] text-mute-2">Live voice call</p>
                )}
              </div>
            </div>

            {/* mini transcript — auto-scrolls */}
            {turns.length > 0 && (
              <div ref={threadRef} className="dash-scroll mx-4 mb-3 max-h-36 space-y-1.5 overflow-y-auto">
                {turns.map((t, i) => (
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

            {/* end call */}
            <div className="border-t border-line p-3">
              <button
                onClick={hangUp}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-ember py-2 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90"
              >
                <PhoneOff size={14} aria-hidden /> End call
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
