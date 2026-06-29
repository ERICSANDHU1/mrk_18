"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import MagneticButton from "../ui/MagneticButton";
import Stat from "../ui/Stat";

const TAGLINE = "CMO in your pocket";
const TAGLINE_LINES = ["CMO", "in your pocket"];

const STATS = [
  { value: 90, suffix: "%", label: "work below the dashboard" },
  { value: 1, suffix: "", label: "decision a week, plain language" },
  { value: 0, suffix: "", label: "marketing hires to start" },
  { value: 24, suffix: "/7", label: "watching working vs leaking" },
];

export default function Hero() {
  const { scrollY } = useScroll();
  const watermarkY = useTransform(scrollY, [0, 900], [0, 140]);

  return (
    <section id="top" className="relative flex min-h-screen flex-col justify-center overflow-hidden px-6 pb-24 pt-40">
      {/* white-grid backdrop — sits behind the revolving 3D objects so they float over it */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 bg-[#f3ecdc]">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
      </div>

      {/* giant outlined watermark, scroll parallax */}
      <motion.div
        aria-hidden
        style={{ y: watermarkY }}
        className="text-outline pointer-events-none absolute -bottom-10 left-1/2 -translate-x-1/2 select-none text-[clamp(8rem,26vw,22rem)] font-extrabold leading-none tracking-tight"
      >
        mrk18
      </motion.div>

      {/* brand mark moved out of the headline — large two-tone "mrk18" on the right */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.6, duration: 1 }}
        style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
        className="pointer-events-none absolute right-[5%] top-20 z-0 hidden select-none text-[clamp(3rem,6.5vw,6.5rem)] font-bold leading-none tracking-[-0.005em] lg:block"
      >
        <span style={{ color: "rgba(27,24,21,0.88)" }}>mrk</span>
        <span style={{ color: "#b4532a" }}>18</span>
      </motion.div>

      <div className="relative z-10 mx-auto w-full max-w-6xl">
        {/* eyebrow */}
        <motion.span
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.2, duration: 0.6 }}
          className="glass inline-flex items-center gap-2.5 rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-muted"
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--gradient-brand)" }} />
          CMO IN YOUR POCKET · BUILT FOR FOUNDERS
        </motion.span>

        {/* headline */}
        <h1 className="mt-8 text-[clamp(3.5rem,11vw,9rem)] font-extrabold leading-[0.98] tracking-[-0.03em]">
          <span aria-label={TAGLINE}>
            {TAGLINE_LINES.map((line, lineIdx) => {
              const offset = TAGLINE_LINES.slice(0, lineIdx).reduce((n, l) => n + l.length, 0);
              return (
                <span key={lineIdx} className="block">
                  {line.split("").map((char, i) => (
                    <span key={i} className="inline-block overflow-hidden align-bottom">
                      <motion.span
                        className={`${lineIdx === 0 ? "text-ink" : "text-gradient"} inline-block`}
                        initial={{ y: "112%" }}
                        animate={{ y: 0 }}
                        transition={{ delay: 2.3 + (offset + i) * 0.045, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                      >
                        {char === " " ? " " : char}
                      </motion.span>
                    </span>
                  ))}
                </span>
              );
            })}
          </span>
        </h1>

        {/* value prop */}
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.75, duration: 0.7 }}
          className="mt-8 max-w-xl text-lg leading-relaxed text-muted"
        >
          The marketing brain founders can&apos;t afford to hire — yet. mrk18 reads your real
          numbers, flags what&apos;s leaking money, and hands you the next move in plain language.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.9, duration: 0.7 }}
          className="mt-10 flex flex-wrap items-center gap-4"
        >
          <MagneticButton href="/sign-up">Get started</MagneticButton>
          <a
            href="#how"
            className="glass rounded-2xl px-7 py-4 text-[15px] font-semibold text-ink transition-colors duration-300 hover:border-amber/40"
          >
            See how it works
          </a>
        </motion.div>

        {/* stats */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 3.05, duration: 0.7 }}
          className="mt-20 grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-4"
        >
          {STATS.map((s) => (
            <Stat key={s.label} value={s.value} suffix={s.suffix} label={s.label} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
