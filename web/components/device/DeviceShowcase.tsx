/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useSpring, useTransform, type MotionValue } from "framer-motion";
import { ArrowRight, Brain, Camera, Mic } from "lucide-react";
import Logo from "@/components/app/Logo";

// the device's three organs — spec chips inside the copy pane
const ORGANS = [
  { icon: Mic, label: "Mic — hears the room" },
  { icon: Camera, label: "Camera — sees it", tag: "V2" },
  { icon: Brain, label: "Agent — your CMO inside" },
] as const;

// opens the Founding-500 modal (mounted by the Pricing section on this page)
const openWaitlist = () => window.dispatchEvent(new Event("mrk18:open-waitlist"));

/** The copy pane's lower half: divider, organ chips, CTA row. Shared by the
 *  desktop sticky pane and the narrow static pane so both stay identical. */
function PaneExtras({ centered = false }: { centered?: boolean }) {
  return (
    <>
      <div
        className={`mt-6 flex flex-wrap gap-2 border-t border-[rgba(27,24,21,0.12)] pt-6 ${
          centered ? "justify-center" : ""
        }`}
      >
        {ORGANS.map(({ icon: Icon, label, ...o }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(27,24,21,0.2)] bg-white/40 px-3 py-1.5 text-[12px] font-semibold text-ink"
          >
            <Icon size={13} className="shrink-0 text-molten" aria-hidden />
            {label}
            {"tag" in o && (
              <span className="text-[10px] font-bold uppercase text-mute-2">{o.tag}</span>
            )}
          </span>
        ))}
      </div>
      <div className={`mt-7 flex flex-wrap items-center gap-3 ${centered ? "justify-center" : ""}`}>
        <button
          onClick={openWaitlist}
          className="inline-flex items-center gap-1.5 rounded-full bg-molten px-4 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90"
        >
          Reserve a Founding 500 seat <ArrowRight size={14} aria-hidden />
        </button>
        <span className="rounded-full border border-[rgba(27,24,21,0.2)] px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-muted">
          Launching soon
        </span>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------------
   "CMO in your pocket" — 2.5D exploded device on the cream page.
   Transparent PNG cutouts stack into a compact device and OPEN along a mostly-
   horizontal, slightly-diagonal axis as you scroll. Spring-smoothed scrub + a
   subtle fan rotation + a blooming scale + drawn-in callouts for a premium feel.
--------------------------------------------------------------------------- */

type LayerDef = { src: string; label: string; scale: number };

// scales normalized so the internal layers nest BEHIND the display when fully
// closed — only the dark shell rim + glass rim show around the smile screen.
const LAYERS: LayerDef[] = [
  { src: "/device/device-1-glass.png?v=3", label: "Front Glass Cover", scale: 1.0 },
  { src: "/device/device-2-display.png?v=11", label: "Dot-Matrix Display", scale: 0.94 },
  { src: "/device/device-3-sensor.png", label: "Sensor Array Puck", scale: 0.86 },
  { src: "/device/device-4-pcb.png", label: "Main Logic Board", scale: 0.92 },
  { src: "/device/device-5-haptic.png", label: "Haptic Motor", scale: 0.8 },
  { src: "/device/device-6-battery.png", label: "Li-Po Battery", scale: 0.93 },
  { src: "/device/device-7-power.png", label: "Power Management Board", scale: 0.82 },
  { src: "/device/device-8-magnet.png", label: "MagSafe Magnet Ring", scale: 0.92 },
  { src: "/device/device-9-shell.png", label: "Matte Back Shell", scale: 1.06 },
];

const N = LAYERS.length;
const CENTER = (N - 1) / 2;
const SPREAD_X = 84; // dominant — horizontal open
const SPREAD_Y = 30; // gentle — the "slightly diagonal" lean
const COMPACT = 0; // fully CLOSED at start → device opens from a solid stack
const FAN = 1.2; // deg of fan rotation per step

function Layer({
  progress,
  i,
  narrow,
}: {
  progress: MotionValue<number>;
  i: number;
  narrow: boolean;
}) {
  const layer = LAYERS[i];
  const d = i - CENTER;
  // narrow viewports have no width to open horizontally → fall back to vertical
  const sx = narrow ? 14 : SPREAD_X;
  const sy = narrow ? 62 : SPREAD_Y;
  // hold the stack CLOSED until the hero photo has dissolved (~0.1), then explode
  const x = useTransform(progress, [0.1, 1], [d * sx * COMPACT, d * sx]);
  const y = useTransform(progress, [0.1, 1], [d * sy * COMPACT, d * sy]);
  const rotate = useTransform(progress, [0.1, 1], [0, narrow ? 0 : d * FAN]);

  const start = 0.22 + i * 0.04;
  const labelOpacity = useTransform(progress, [start, start + 0.1], [0, 1]);
  const lineScale = useTransform(progress, [start, start + 0.14], [0, 1]);
  const above = i % 2 === 0;

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      style={{ x, y, zIndex: N - i }}
    >
      <motion.img
        src={layer.src}
        alt=""
        aria-hidden
        draggable={false}
        className="pointer-events-none w-[min(26vw,320px)] max-w-none select-none"
        style={{ rotate, scale: layer.scale }}
      />
      {!narrow && (
        <motion.div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2"
          style={{ opacity: labelOpacity }}
        >
          <div
            className="flex flex-col items-center"
            style={{ transform: above ? "translateY(calc(-100% - 104px))" : "translateY(104px)" }}
          >
            {above && (
              <span className="whitespace-nowrap text-[12px] font-medium tracking-tight text-ink">
                {layer.label}
              </span>
            )}
            <motion.span
              className="block w-px"
              style={{
                height: 24,
                margin: above ? "5px 0 0" : "0 0 5px",
                background: "rgba(27,24,21,0.6)",
                scaleY: lineScale,
                originY: above ? 0 : 1,
              }}
            />
            {!above && (
              <span className="whitespace-nowrap text-[12px] font-medium tracking-tight text-ink">
                {layer.label}
              </span>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

export default function DeviceShowcase() {
  const trackRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ["start start", "end end"] });
  // spring-smoothed scrub → buttery, premium motion with a touch of momentum
  const progress = useSpring(scrollYProgress, { stiffness: 70, damping: 18, mass: 0.4 });
  const stageScale = useTransform(progress, [0, 1], [0.95, 1.0]);
  // the assembled device photo opens the section, then dissolves into the explode
  const heroOpacity = useTransform(progress, [0, 0.1], [1, 0]);

  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Mobile / tablet: the scroll-driven explode has no room to open and crashes
  // through the copy — show a clean static shot of the assembled device instead.
  if (narrow) {
    return (
      <section id="device" aria-label="CMO in your pocket" className="relative overflow-hidden px-6 py-20">
        <div className="mx-auto flex max-w-xl flex-col items-center text-center">
          {/* same glass pane as the desktop copy block */}
          <div className="glass flex flex-col items-center rounded-2xl p-6 sm:p-7">
            <span className="flex items-center gap-2.5 text-[12px] font-semibold uppercase tracking-[0.3em] text-ink">
              <Logo size={15} className="shrink-0" />
              01 — CMO in your pocket
            </span>
            <h2 className="mt-5 text-[clamp(1.9rem,7vw,2.6rem)] font-semibold leading-[1.14] text-ink">
              <span className="block">Your marketing brain —</span>
              <span className="block text-gradient">now a device you carry.</span>
            </h2>
            <p className="mt-5 max-w-md text-[1rem] leading-relaxed text-ink">
              Nine layers of hardware, one glanceable companion — your CMO, distilled into
              something small enough to live in your pocket.
            </p>
            <PaneExtras centered />
          </div>
          {/* the assembled device — same opening shot as the desktop sequence */}
          <div className="relative mt-12 aspect-square w-[min(72vw,300px)]">
            <img
              src="/device/new-smile.png"
              alt="the mrk device"
              draggable={false}
              className="pointer-events-none h-full w-full select-none object-contain"
            />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="device" aria-label="CMO in your pocket" className="relative">
      <div ref={trackRef} className="relative" style={{ height: "340vh" }}>
        <div className="sticky top-0 h-screen overflow-hidden">
          {/* copy — aligned to the same max-w-6xl container as the other sections */}
          <div
            className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex h-full flex-col ${
              // justify-start: a centered copy block leaves the sticky screen's whole
              // top half empty while the section scrolls in — the ugly gap after the marquee
              narrow ? "items-center pt-24 text-center" : "justify-start pt-[12vh]"
            }`}
          >
            <div className="mx-auto w-full max-w-6xl px-6">
              {/* one glass pane for the whole copy block — the drifting 3D shapes
                  frost through it instead of colliding with the text. Fuller card:
                  brand mark, organ chips + a real CTA so the column earns its space. */}
              <div className={narrow ? "mx-auto max-w-xl" : "glass pointer-events-auto max-w-[clamp(22rem,34vw,28rem)] rounded-2xl p-7 md:p-8"}>
                <span className="flex items-center gap-2.5 text-[12px] font-semibold uppercase tracking-[0.3em] text-ink">
                  <Logo size={15} className="shrink-0" />
                  01 — CMO in your pocket
                </span>
                <h2 className="mt-5 text-[clamp(1.7rem,3.1vw,2.35rem)] font-semibold leading-[1.12] text-ink">
                  <span className="block">Your marketing brain —</span>
                  <span className="block text-gradient">now a device you carry.</span>
                </h2>
                <p className="mt-5 text-[1.02rem] leading-relaxed text-ink">
                  Nine layers of hardware, one glanceable companion — your CMO, distilled
                  into something small enough to live in your pocket.
                </p>
                <PaneExtras />
              </div>
            </div>
          </div>

          {/* device stage — right side on desktop, full width on narrow */}
          <div className={`absolute inset-y-0 ${narrow ? "inset-x-0" : "right-0 w-[64%]"}`}>
            <motion.div className="relative h-full w-full" style={{ scale: stageScale }}>
              {LAYERS.map((_, i) => (
                <Layer key={i} progress={progress} i={i} narrow={narrow} />
              ))}
              {/* the assembled device — the opening shot; fades as scrolling begins */}
              <motion.img
                src="/device/new-smile.png"
                alt="the mrk device"
                draggable={false}
                style={{ opacity: heroOpacity, zIndex: 40 }}
                className="pointer-events-none absolute left-1/2 top-1/2 w-[min(27vw,330px)] -translate-x-1/2 -translate-y-1/2 select-none"
              />
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
