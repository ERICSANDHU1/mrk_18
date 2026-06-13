"use client";

import { useEffect, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { useMotionValue, type MotionValue } from "framer-motion";
import { useLenis } from "lenis/react";
import { useFilmStore, FILM_VH } from "./store";
import SceneManager from "./SceneManager";
import MasterCamera from "./MasterCamera";
import Particles from "./Particles";
import PostFX from "./PostFX";
import SpotlightDirector from "./SpotlightDirector";
import DimMask from "./DimMask";
import NarratorTrack from "./NarratorTrack";
import DebugScrubber from "./DebugScrubber";

/* Keeps the demand-rendered canvas alive while the film is being scrubbed —
   the store itself is driven on the DOM side (see Film), independent of rAF. */
function Invalidator({ g, v }: { g: MotionValue<number>; v: MotionValue<number> }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const u1 = g.on("change", () => invalidate());
    const u2 = v.on("change", () => invalidate());
    invalidate();
    return () => {
      u1();
      u2();
    };
  }, [g, v, invalidate]);
  return null;
}

/* Section 02 — the 12-frame film. Phase 0: the engine + 12 dummy scenes. */
export default function Film() {
  const trackRef = useRef<HTMLDivElement>(null);
  const lenis = useLenis();

  const g = useMotionValue(0);
  const v = useMotionValue(0);
  const spotX = useMotionValue(50);
  const spotY = useMotionValue(50);

  // Lenis is the scroll source of truth (spec §1.5): derive film progress g
  // from the track's position on every scroll frame (start→end of the track).
  useLenis((lenis: { velocity?: number } | undefined) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dist = el.offsetHeight - window.innerHeight;
    g.set(dist > 0 ? Math.min(1, Math.max(0, -rect.top / dist)) : 0);
    v.set(Math.min(Math.abs(lenis?.velocity ?? 0) / 30, 5));
  });

  // init on mount + keep the store in sync whenever g changes (DOM side,
  // independent of the render loop → reversible and rAF-agnostic).
  useEffect(() => {
    const el = trackRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const dist = el.offsetHeight - window.innerHeight;
      g.set(dist > 0 ? Math.min(1, Math.max(0, -rect.top / dist)) : 0);
    }
    const update = () => useFilmStore.getState().setLive(g.get(), v.get());
    const unsub = g.on("change", update);
    update();
    return unsub;
  }, [g, v]);

  const scrollToG = (gg: number) => {
    const el = trackRef.current;
    if (!el) return;
    const top = el.offsetTop;
    const dist = el.offsetHeight - window.innerHeight;
    const y = top + Math.max(0, Math.min(1, gg)) * dist;
    if (lenis) lenis.scrollTo(y, { immediate: true });
    else window.scrollTo(0, y);
  };

  return (
    <section className="relative" aria-label="The MRK18 film">
      <div ref={trackRef} style={{ position: "relative", height: `${FILM_VH}vh` }}>
        <div className="sticky top-0 h-screen overflow-hidden" style={{ background: "#0A0A0B" }}>
          <Canvas
            frameloop="demand"
            dpr={[1, 1.75]}
            camera={{ position: [0, 1.2, 6], fov: 45 }}
            gl={{ antialias: true }}
            className="!absolute inset-0"
          >
            <color attach="background" args={["#0A0A0B"]} />
            <Invalidator g={g} v={v} />
            <MasterCamera />
            <SpotlightDirector spotX={spotX} spotY={spotY} />
            <SceneManager />
            <Particles />
            <PostFX />
          </Canvas>

          {/* overlay root (DOM) */}
          <DimMask spotX={spotX} spotY={spotY} />
          <NarratorTrack g={g} />
          <DebugScrubber g={g} v={v} scrollToG={scrollToG} />
        </div>
      </div>
    </section>
  );
}
