"use client";

import { useState } from "react";
import { useMotionValueEvent, type MotionValue } from "framer-motion";
import { sceneFromG, clamp01 } from "./store";
import { NARRATOR } from "./narratorScript";

/* §1.11 Narrator track — one line per beat, typed word/char by char as the
   user scrolls (scroll back un-types). Single active line, lives in the dark
   zone, ≤1 gradient phrase. Data-driven by narratorScript.ts. */

const POS: Record<string, React.CSSProperties> = {
  "lower-left": { left: "6%", bottom: "12%", textAlign: "left", maxWidth: "34ch" },
  "lower-right": { right: "6%", bottom: "12%", textAlign: "right", maxWidth: "34ch" },
  "upper-left": { left: "6%", top: "14%", textAlign: "left", maxWidth: "34ch" },
  "upper-right": { right: "6%", top: "14%", textAlign: "right", maxWidth: "34ch" },
  below: { left: "50%", bottom: "9%", transform: "translateX(-50%)", textAlign: "center", maxWidth: "40ch" },
};

type Shown = { text: string; gradient?: string; chars: number; position: string } | null;

export default function NarratorTrack({ g }: { g: MotionValue<number> }) {
  const [shown, setShown] = useState<Shown>(null);

  useMotionValueEvent(g, "change", (val) => {
    const { scene, local } = sceneFromG(val);
    const line = NARRATOR.find((l) => l.scene === scene && local >= l.inAt && local <= l.outAt);
    if (!line) {
      setShown((s) => (s ? null : s));
      return;
    }
    const typeWindow = Math.min(0.08, line.outAt - line.inAt);
    const typeP = clamp01((local - line.inAt) / Math.max(0.0001, typeWindow));
    const chars = Math.round(typeP * line.text.length);
    setShown((s) =>
      s && s.text === line.text && s.chars === chars
        ? s
        : { text: line.text, gradient: line.gradient, chars, position: line.position }
    );
  });

  if (!shown) return null;
  const visible = shown.text.slice(0, shown.chars);

  return (
    <div
      aria-live="polite"
      style={{
        position: "absolute",
        zIndex: 6,
        fontFamily: 'var(--font-jbmono), ui-monospace, monospace',
        fontSize: 15,
        letterSpacing: "0.06em",
        lineHeight: 1.5,
        color: "#9A958C",
        pointerEvents: "none",
        ...POS[shown.position],
      }}
    >
      {renderWithGradient(visible, shown.gradient)}
      <span style={{ opacity: 0.6 }}>▍</span>
    </div>
  );
}

function renderWithGradient(visible: string, gradient?: string) {
  if (!gradient) return <span>{visible}</span>;
  const idx = visible.indexOf(gradient);
  if (idx === -1) return <span>{visible}</span>; // phrase not fully typed yet
  return (
    <span>
      {visible.slice(0, idx)}
      <span className="text-gradient">{gradient}</span>
      {visible.slice(idx + gradient.length)}
    </span>
  );
}
