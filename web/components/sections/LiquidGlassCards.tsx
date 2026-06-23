"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  motion,
  useInView,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";

type IconKind = "target" | "eye" | "graph";
type Step = { num: string; title: string; line: string; pills: string[]; icon: IconKind };

const STEPS: Step[] = [
  {
    num: "01",
    title: "ADVISE",
    line: "Tells you what to do next — and what to stop.",
    pills: ["ICP", "positioning", "channels"],
    icon: "target",
  },
  {
    num: "02",
    title: "WATCHDOG",
    line: "Watches weekly, flags what's leaking money before it's a crisis.",
    pills: ["spend", "CAC", "activation", "retention"],
    icon: "eye",
  },
  {
    num: "03",
    title: "EXECUTE",
    line: "Helps run the work, so advice ships — not another report.",
    pills: ["copy", "creative", "scheduling", "approvals"],
    icon: "graph",
  },
];

/* ---- displacement map for the lead-card refraction (Chromium) ---- */
function buildDisplacementMap(w: number, h: number, radius: number, rim: number): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const cx = w / 2;
  const cy = h / 2;
  const hw = w / 2;
  const hh = h / 2;
  const sdf = (px: number, py: number) => {
    const qx = Math.abs(px - cx) - (hw - radius);
    const qy = Math.abs(py - cy) - (hh - radius);
    const ax = Math.max(qx, 0);
    const ay = Math.max(qy, 0);
    return Math.min(Math.max(qx, qy), 0) + Math.hypot(ax, ay) - radius;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dist = -sdf(x, y);
      let dx = 0;
      let dy = 0;
      if (dist >= 0 && dist < rim) {
        const gx = sdf(x + 1, y) - sdf(x - 1, y);
        const gy = sdf(x, y + 1) - sdf(x, y - 1);
        const gl = Math.hypot(gx, gy) || 1;
        const t = dist / rim;
        const mag = Math.pow(1 - t, 1.8);
        dx = (gx / gl) * mag;
        dy = (gy / gl) * mag;
      }
      d[i] = 128 + dx * 127;
      d[i + 1] = 128 + dy * 127;
      d[i + 2] = 128;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}

/* ---- refined, professional symbols that stroke-draw on each loop ---- */
function CardIcon({ kind, reveal, reduce }: { kind: IconKind; reveal: boolean; reduce: boolean }) {
  const draw = (delay: number, dur = 0.6) => ({
    initial: { pathLength: 0, opacity: 0 },
    animate: { pathLength: reveal ? 1 : 0, opacity: reveal ? 1 : 0 },
    transition: { duration: reduce ? 0 : dur, delay: reduce ? 0 : delay, ease: "easeInOut" as const },
  });
  const dot = (delay: number) => ({
    initial: { scale: 0 },
    animate: { scale: reveal ? 1 : 0 },
    transition: reduce ? { duration: 0 } : { delay, type: "spring" as const, stiffness: 320, damping: 18 },
    style: { transformOrigin: "24px 24px" },
  });
  return (
    <motion.svg
      width="60"
      height="60"
      viewBox="0 0 48 48"
      fill="none"
      stroke="#b4532a"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      animate={{ opacity: reveal ? 1 : 0, scale: reveal ? 1 : 0.92 }}
      transition={{ duration: reduce ? 0 : 0.35 }}
    >
      {kind === "target" && (
        <>
          <motion.circle cx="24" cy="24" r="18" {...draw(0)} />
          <motion.circle cx="24" cy="24" r="10" {...draw(0.16)} />
          <motion.path d="M24 1.5 L24 7" {...draw(0.3, 0.3)} />
          <motion.path d="M24 41 L24 46.5" {...draw(0.3, 0.3)} />
          <motion.path d="M1.5 24 L7 24" {...draw(0.36, 0.3)} />
          <motion.path d="M41 24 L46.5 24" {...draw(0.36, 0.3)} />
          <motion.circle cx="24" cy="24" r="3" fill="#b4532a" stroke="none" {...dot(0.45)} />
        </>
      )}
      {kind === "eye" && (
        <>
          <motion.path
            d="M3 24 C9 15 16 11 24 11 C32 11 39 15 45 24 C39 33 32 37 24 37 C16 37 9 33 3 24 Z"
            {...draw(0, 0.7)}
          />
          <motion.circle cx="24" cy="24" r="7" {...draw(0.28, 0.45)} />
          <motion.circle cx="24" cy="24" r="2.6" fill="#b4532a" stroke="none" {...dot(0.5)} />
        </>
      )}
      {kind === "graph" && (
        <>
          <motion.path d="M7 41 L7 7" {...draw(0, 0.3)} />
          <motion.path d="M7 41 L43 41" {...draw(0.08, 0.3)} />
          <motion.path d="M11 34 L20 25 L27 29 L39 13" {...draw(0.22, 0.6)} />
          <motion.path d="M32 13 L39 13 L39 20" {...draw(0.62, 0.3)} />
        </>
      )}
    </motion.svg>
  );
}

function Card({
  step,
  i,
  cardRef,
  opacity,
  isLead,
}: {
  step: Step;
  i: number;
  cardRef: RefObject<HTMLDivElement | null>;
  opacity?: MotionValue<number>;
  isLead: boolean;
}) {
  const reduce = useReducedMotion() ?? false;
  const inView = useInView(cardRef, { margin: "-10% 0px -10% 0px" });
  const total = step.pills.join("").length;
  const [typed, setTyped] = useState(0);
  const [reveal, setReveal] = useState(false);

  // continuous ~4s loop: type → symbol draws → hold → erase → repeat (only while in view)
  useEffect(() => {
    if (reduce) {
      setTyped(total);
      setReveal(true);
      return;
    }
    if (!inView) {
      setTyped(0);
      setReveal(false);
      return;
    }
    const CYCLE = 4000;
    const TYPE_END = 1300;
    const SYM_START = 1450;
    const SYM_END = 3200;
    const ERASE_START = 3350;
    const ERASE_END = 3850;
    let raf = 0;
    let start = 0;
    let lastTyped = -1;
    let lastReveal: boolean | null = null;
    const loop = (now: number) => {
      if (!start) start = now;
      const t = (now - start) % CYCLE;
      let nt: number;
      if (t < TYPE_END) nt = Math.round((t / TYPE_END) * total);
      else if (t < ERASE_START) nt = total;
      else if (t < ERASE_END) nt = Math.round((1 - (t - ERASE_START) / (ERASE_END - ERASE_START)) * total);
      else nt = 0;
      if (nt !== lastTyped) {
        lastTyped = nt;
        setTyped(nt);
      }
      const rev = t >= SYM_START && t < SYM_END;
      if (rev !== lastReveal) {
        lastReveal = rev;
        setReveal(rev);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduce, total]);

  let acc = 0;

  return (
    <motion.div
      ref={cardRef}
      className={`liquid-glass sticky rounded-3xl p-10 md:p-14 ${isLead ? "liquid-glass--lead" : ""}`}
      style={{ top: `calc(110px + ${i * 28}px)`, opacity }}
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div>
          <span className="text-gradient text-sm font-extrabold tracking-[0.3em]">{step.num}</span>
          <h3 className="mt-3 text-4xl font-extrabold tracking-tight md:text-5xl">{step.title}</h3>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-muted">{step.line}</p>
        </div>
        <div className="flex flex-col items-start gap-6 md:items-end">
          <CardIcon kind={step.icon} reveal={reveal} reduce={reduce} />
          <div className="flex max-w-xs flex-wrap gap-2.5 md:justify-end">
            {step.pills.map((pill) => {
              const start = acc;
              acc += pill.length;
              const shown = pill.slice(0, Math.max(0, Math.min(pill.length, typed - start)));
              const active = typed >= start && typed < start + pill.length;
              return (
                <span
                  key={pill}
                  className="relative rounded-full border border-[rgba(27,24,21,0.18)] px-4 py-1.5 text-[12.5px] text-muted"
                >
                  <span className="invisible">{pill}</span>
                  <span className="absolute inset-y-0 left-4 right-4 flex items-center">
                    {shown}
                    {active && (
                      <span className="ml-px inline-block h-[0.9em] w-px animate-pulse bg-current align-middle" />
                    )}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function LiquidGlassCards() {
  const ref0 = useRef<HTMLDivElement>(null);
  const ref1 = useRef<HTMLDivElement>(null);
  const ref2 = useRef<HTMLDivElement>(null);
  const refs = [ref0, ref1, ref2];

  const dispR = useRef<SVGFEDisplacementMapElement>(null);
  const dispG = useRef<SVGFEDisplacementMapElement>(null);
  const dispB = useRef<SVGFEDisplacementMapElement>(null);
  const [map, setMap] = useState<{ url: string; w: number; h: number } | null>(null);
  const [chromium, setChromium] = useState(false);
  const reduce = useReducedMotion() ?? false;

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const isChromium =
      /\b(Chrome|Chromium|Edg|Brave)\b/i.test(ua) && !/(iPhone|iPad|iPod|CriOS|FxiOS)/i.test(ua);
    const supportsUrl =
      typeof CSS !== "undefined" && !!CSS.supports && CSS.supports("backdrop-filter", "url(#x)");
    setChromium(isChromium && supportsUrl);
  }, []);

  useEffect(() => {
    const el = ref0.current;
    if (!el || !chromium) return;
    const gen = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(2, Math.round(r.width));
      const h = Math.max(2, Math.round(r.height));
      setMap({ url: buildDisplacementMap(w, h, 24, 38), w, h });
    };
    gen();
    const ro = new ResizeObserver(gen);
    ro.observe(el);
    return () => ro.disconnect();
  }, [chromium]);

  useEffect(() => {
    if (chromium && map && !reduce) {
      document.documentElement.classList.add("liquid-on");
      return () => document.documentElement.classList.remove("liquid-on");
    }
  }, [chromium, map, reduce]);

  const { scrollYProgress: leadProg } = useScroll({ target: ref0, offset: ["start end", "start start"] });
  const dispScale = useTransform(leadProg, [0, 1], [0, 54]);
  useMotionValueEvent(dispScale, "change", (v) => {
    if (reduce) return;
    dispR.current?.setAttribute("scale", String(v + 2));
    dispG.current?.setAttribute("scale", String(v));
    dispB.current?.setAttribute("scale", String(Math.max(0, v - 2)));
  });

  const { scrollYProgress: cover1 } = useScroll({ target: ref1, offset: ["start end", "start start"] });
  const { scrollYProgress: cover2 } = useScroll({ target: ref2, offset: ["start end", "start start"] });
  const opacity0 = useTransform(cover1, [0.55, 0.82], [1, 0]);
  const opacity1 = useTransform(cover2, [0.55, 0.82], [1, 0]);
  const opacities: (MotionValue<number> | undefined)[] = [opacity0, opacity1, undefined];

  return (
    <>
      {chromium && map && (
        <svg aria-hidden width="0" height="0" style={{ position: "absolute" }}>
          <filter
            id="mrk-liquid"
            filterUnits="userSpaceOnUse"
            primitiveUnits="userSpaceOnUse"
            x={-28}
            y={-28}
            width={map.w + 56}
            height={map.h + 56}
            colorInterpolationFilters="sRGB"
          >
            <feImage href={map.url} x={0} y={0} width={map.w} height={map.h} preserveAspectRatio="none" result="map" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.5" result="src" />
            <feDisplacementMap ref={dispR} in="src" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G" result="dr" />
            <feColorMatrix in="dr" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cr" />
            <feDisplacementMap ref={dispG} in="src" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G" result="dg" />
            <feColorMatrix in="dg" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cg" />
            <feDisplacementMap ref={dispB} in="src" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G" result="db" />
            <feColorMatrix in="db" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="cb" />
            <feBlend in="cr" in2="cg" mode="screen" result="rg" />
            <feBlend in="rg" in2="cb" mode="screen" />
          </filter>
        </svg>
      )}

      <div className="mt-16 space-y-8">
        {STEPS.map((step, i) => (
          <Card key={step.num} step={step} i={i} cardRef={refs[i]} opacity={opacities[i]} isLead={i === 0} />
        ))}
      </div>
    </>
  );
}
