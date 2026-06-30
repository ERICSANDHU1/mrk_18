"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Phone, X } from "lucide-react";
import Logo from "@/components/app/Logo";

// a fresh, catchy "how can I help" opener each time — spoken + shown as a bubble
const LINES = [
  "Hey — your CMO here. What's the one marketing thing on your mind right now?",
  "Got a minute? Let's talk through your biggest marketing question — out loud.",
  "I'm online and listening. Positioning, content, a competitor — what do you want to crack?",
  "Quick gut-check: what's the marketing problem you'd love solved today?",
  "Want to think out loud with me for a second? I've got ideas for you.",
  "Ready when you are. What should we tackle — and where are you stuck?",
  "Your CMO, in your ear. Tell me what's slowing your growth right now.",
];

function trySpeak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find((x) => /en[-_]IN/i.test(x.lang)) || voices.find((x) => /^en/i.test(x.lang));
    if (v) u.voice = v;
    u.rate = 1.02;
    window.speechSynthesis.speak(u); // may be blocked until the user interacts — the bubble still shows
  } catch {
    /* speech unavailable */
  }
}

/** Proactive CMO concierge: on opening Chat / Comrk / Chief it greets the founder
 *  in a chat bubble (and speaks it), asking how it can help. "Yes" fires
 *  mrk18:cmo-call → CmoPanel opens and starts a real voice call. */
export default function CmoConcierge() {
  const pathname = usePathname();
  // which of the three tabs we're on — the greeting re-toggles whenever this changes
  const tab = pathname.startsWith("/chief")
    ? "chief"
    : pathname.startsWith("/cowork") || pathname.startsWith("/mrk")
      ? "comrk"
      : pathname.startsWith("/chat")
        ? "chat"
        : null;
  const [show, setShow] = useState(false);
  const [line, setLine] = useState("");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    // hide the previous bubble + stop any speech the instant the tab changes
    setShow(false);
    window.speechSynthesis?.cancel();
    if (!tab) return;
    const picked = LINES[Math.floor(Math.random() * LINES.length)];
    const t = setTimeout(() => {
      setLine(picked);
      setNonce((n) => n + 1);
      setShow(true);
      trySpeak(picked);
    }, 700);
    return () => clearTimeout(t);
  }, [tab]);

  const close = () => {
    window.speechSynthesis?.cancel();
    setShow(false);
  };
  const accept = () => {
    window.speechSynthesis?.cancel();
    setShow(false);
    window.dispatchEvent(new Event("mrk18:cmo-call")); // CmoPanel opens + starts the call
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={nonce}
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-24 right-5 z-40 w-[320px] max-w-[86vw]"
        >
          <div className="overflow-hidden rounded-2xl rounded-br-md border border-molten/25 bg-surface shadow-2xl shadow-[var(--shadow-color)]">
            <span aria-hidden className="block h-[2.5px] bg-gradient-to-r from-molten to-ember" />
            <div className="p-4">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-xl border border-line bg-surface">
                  <Logo width={18} height={14} />
                </span>
                <div className="leading-tight">
                  <p className="text-[12.5px] font-bold text-ink">Your CMO</p>
                  <p className="flex items-center gap-1.5 text-[10.5px] text-mute">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-molten pulse-dot" />
                    online
                  </p>
                </div>
                <button
                  onClick={close}
                  aria-label="Dismiss"
                  className="ml-auto grid h-6 w-6 place-items-center rounded-md text-mute-2 transition-colors hover:bg-[var(--overlay-subtle)] hover:text-ink"
                >
                  <X size={14} aria-hidden />
                </button>
              </div>

              <p className="mt-3 text-[13.5px] leading-relaxed text-ink">{line}</p>

              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={accept}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-molten px-3.5 py-2 text-[12.5px] font-bold text-white transition hover:brightness-95"
                >
                  <Phone size={14} aria-hidden /> Yes, let&apos;s talk
                </button>
                <button
                  onClick={close}
                  className="rounded-lg px-3 py-2 text-[12.5px] font-semibold text-mute-2 transition-colors hover:text-ink"
                >
                  Not now
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
