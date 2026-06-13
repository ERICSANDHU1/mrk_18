"use client";

import { useRef } from "react";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import Reveal from "../ui/Reveal";
import Stat from "../ui/Stat";

const BAND = [
  { value: 11, suffix: "/11", label: "founders: green metrics, flat revenue" },
  { value: 27, suffix: " hrs", label: "/week lost to marketing they shouldn't touch" },
  { value: 2, suffix: "", label: "avg customers their green campaigns drove" },
  { value: 1, suffix: "", label: "honest second opinion missing" },
];

/* receipt line items — deck-audited data, bitter-truth voice */
const ITEMS: { left: string; right: string; sub?: string }[] = [
  { left: "META ADS", right: "₹40,000", sub: "→ 2 customers" },
  { left: "AGENCY RETAINER", right: "₹25,000", sub: "→ a PDF saying “all good”" },
  { left: "BOOSTED POSTS", right: "₹8,000", sub: "→ likes. zero sales." },
  { left: "FOUNDER'S OWN TIME", right: "27 hrs/wk", sub: "→ ₹0 back" },
  { left: "CAC vs PRODUCT PRICE", right: "₹450 / ₹599", sub: "→ losing on every sale" },
  { left: "CONVERSIONS VISIBLE", right: "21%", sub: "→ the other 79% untracked" },
];

/** one printed line — fades in at its slice of the scroll progress */
function PrintLine({
  progress,
  start,
  className = "",
  children,
}: {
  progress: MotionValue<number>;
  start: number;
  className?: string;
  children: React.ReactNode;
}) {
  const opacity = useTransform(progress, [start, start + 0.05], [0, 1]);
  const y = useTransform(progress, [start, start + 0.05], [10, 0]);
  return (
    <motion.div style={{ opacity, y }} className={className}>
      {children}
    </motion.div>
  );
}

function Receipt() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.92", "start 0.3"],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 24, mass: 0.4 });

  /* stamp slams in near the end of the print */
  const stampScale = useTransform(progress, [0.86, 0.96], [2.4, 1]);
  const stampOpacity = useTransform(progress, [0.86, 0.93], [0, 1]);
  const stampRotate = useTransform(progress, [0.86, 0.96], [-2, -12]);

  /* zigzag torn bottom edge: right→left teeth, alternating depth */
  const TEETH = 22;
  const zig: string[] = [];
  for (let i = 0; i <= TEETH * 2; i++) {
    const x = 100 - (i / (TEETH * 2)) * 100;
    const y = i % 2 === 0 ? "calc(100% - 9px)" : "100%";
    zig.push(`${x.toFixed(2)}% ${y}`);
  }
  const tornEdge = `polygon(0% 0%, 100% 0%, ${zig.join(", ")})`;

  /* per-line start positions across the print window */
  const step = 0.78 / (ITEMS.length + 5);
  let cursor = 0.04;
  const next = () => (cursor += step);

  const headerAt = cursor;
  const itemStarts = ITEMS.map(() => next());
  const sepAt = next();
  const totalAt = next();
  const opinionAt = next();
  const barcodeAt = next();

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[420px]" style={{ perspective: 900 }}>
      <motion.div
        className="relative -rotate-[1.4deg] px-7 pb-12 pt-8 font-mono text-[13px] leading-relaxed text-surface shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
        style={{ background: "#F4F1EC", clipPath: tornEdge }}
      >
        {/* header */}
        <PrintLine progress={progress} start={headerAt} className="text-center">
          <div className="text-[17px] font-extrabold tracking-[0.18em]">MRK18</div>
          <div className="mt-1 text-[11px] tracking-[0.24em] text-surface/70">
            MARKETING AUDIT · LAST 30 DAYS
          </div>
          <div className="mt-1 text-[11px] tracking-[0.18em] text-surface/50">
            FOUNDER #11 OF 11 · INDIA
          </div>
          <div className="mt-4 border-t border-dashed border-surface/40" />
        </PrintLine>

        {/* line items */}
        <div className="mt-4 space-y-3.5">
          {ITEMS.map((item, i) => (
            <PrintLine key={item.left} progress={progress} start={itemStarts[i]}>
              <div className="flex items-baseline gap-2">
                <span className="font-semibold tracking-wide">{item.left}</span>
                <span className="flex-1 border-b border-dotted border-surface/40" />
                <span className="font-bold tabular-nums">{item.right}</span>
              </div>
              {item.sub && (
                <div className="mt-0.5 text-right text-[12px] text-[#B91C1C]">{item.sub}</div>
              )}
            </PrintLine>
          ))}
        </div>

        {/* totals */}
        <PrintLine progress={progress} start={sepAt}>
          <div className="mt-5 border-t border-dashed border-surface/40" />
        </PrintLine>

        <PrintLine progress={progress} start={totalAt} className="mt-4">
          <div className="flex items-baseline gap-2 text-[15px] font-extrabold">
            <span className="tracking-wide">TOTAL BURNED / MONTH</span>
            <span className="flex-1 border-b border-dotted border-surface/40" />
            <span className="tabular-nums">₹73,000</span>
          </div>
        </PrintLine>

        <PrintLine progress={progress} start={opinionAt} className="mt-3">
          <div className="flex items-baseline gap-2 text-[13px] font-bold">
            <span className="tracking-wide">HONEST SECOND OPINION</span>
            <span className="flex-1 border-b border-dotted border-surface/40" />
            <span className="text-[#B91C1C]">MISSING</span>
          </div>
        </PrintLine>

        {/* barcode footer */}
        <PrintLine progress={progress} start={barcodeAt} className="mt-7">
          <div
            className="h-10 w-full"
            style={{
              background:
                "repeating-linear-gradient(90deg, #141416 0 2px, transparent 2px 5px, #141416 5px 6px, transparent 6px 10px, #141416 10px 13px, transparent 13px 16px)",
            }}
          />
          <div className="mt-2 text-center text-[10.5px] tracking-[0.22em] text-surface/60">
            EVERY FOUNDER · SAME RECEIPT · NOBODY AUDITS THE AUDITORS
          </div>
        </PrintLine>

        {/* the stamp */}
        <motion.div
          aria-hidden
          style={{ scale: stampScale, opacity: stampOpacity, rotate: stampRotate }}
          className="pointer-events-none absolute bottom-[88px] left-1/2 -translate-x-1/2 select-none"
        >
          <span className="inline-block rounded-md border-[5px] border-[#B91C1C] px-5 py-1.5 text-[34px] font-extrabold tracking-[0.28em] text-[#B91C1C] [mask-image:radial-gradient(ellipse_at_center,black_72%,transparent_100%)]">
            LEAKING
          </span>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default function Problem() {
  return (
    <section className="relative px-6 py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <span className="text-[12px] font-semibold uppercase tracking-[0.3em] text-muted">
            01 — The audit
          </span>
        </Reveal>

        <Reveal delay={0.08}>
          <h2 className="mt-6 max-w-3xl text-[clamp(2.2rem,5.5vw,4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
            We audited a founder&apos;s month.{" "}
            <em className="text-gradient italic">Here&apos;s the receipt.</em>
          </h2>
        </Reveal>

        <Reveal delay={0.16}>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            Eleven founders opened their books to us. Eleven receipts looked like this — green
            dashboards on top, leaking money underneath.
          </p>
        </Reveal>

        <div className="mt-16">
          <Receipt />
        </div>

        <Reveal delay={0.1}>
          <div className="mt-20 grid grid-cols-2 gap-x-8 gap-y-10 border-t border-stroke pt-12 md:grid-cols-4">
            {BAND.map((s) => (
              <Stat key={s.label} value={s.value} suffix={s.suffix} label={s.label} />
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
