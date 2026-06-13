"use client";

import { useState } from "react";
import { useMotionValueEvent, type MotionValue } from "framer-motion";
import { SCENES, useFilmStore } from "./store";

/* Dev-only scrubber: jump/scrub any scene without scrolling 4350vh, plus a live
   readout of g / v / activeScene / localProgress. Hidden in production. */
export default function DebugScrubber({
  g,
  v,
  scrollToG,
}: {
  g: MotionValue<number>;
  v: MotionValue<number>;
  scrollToG: (g: number) => void;
}) {
  const [gVal, setGVal] = useState(0);
  const [vVal, setVVal] = useState(0);
  const active = useFilmStore((s) => s.activeScene);
  const local = useFilmStore((s) => s.localProgress);

  useMotionValueEvent(g, "change", (x) => setGVal(x));
  useMotionValueEvent(v, "change", (x) => setVVal(x));

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div
      style={{
        position: "fixed",
        zIndex: 60,
        left: 12,
        bottom: 12,
        width: 280,
        padding: "10px 12px",
        borderRadius: 10,
        background: "rgba(20,20,22,0.78)",
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(244,241,236,0.14)",
        color: "#F4F1EC",
        fontFamily: "var(--font-jbmono), ui-monospace, monospace",
        fontSize: 11,
        pointerEvents: "auto",
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, color: "#9A958C" }}>
        <span>FILM · debug</span>
        <span>
          {SCENES[active]?.id} · {(local * 100).toFixed(0)}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={gVal}
        onChange={(e) => scrollToG(parseFloat(e.target.value))}
        style={{ width: "100%" }}
      />
      <div style={{ marginTop: 4, color: "#9A958C" }}>
        g {gVal.toFixed(3)} · v {vVal.toFixed(2)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
        {SCENES.map((s, i) => (
          <button
            key={s.id}
            onClick={() => scrollToG(s.start + 0.001)}
            style={{
              flex: "1 0 18%",
              fontSize: 10,
              padding: "3px 0",
              borderRadius: 5,
              cursor: "pointer",
              color: i === active ? "#0A0A0B" : "#F4F1EC",
              background: i === active ? "#FF9E2C" : "rgba(244,241,236,0.08)",
              border: "1px solid rgba(244,241,236,0.12)",
            }}
          >
            {s.id}
          </button>
        ))}
      </div>
    </div>
  );
}
