"use client";

import HeroBackground from "../HeroBackground";
import Reveal from "../ui/Reveal";

/* Section 01 — intro over the animated "Grid + Light Sweep" background. */
export default function MindAtWork() {
  return (
    <section className="relative">
      <HeroBackground
        className="flex min-h-screen items-center"
        nodes={["STRATEGY", "CONTENT", "CAMPAIGNS", "ANALYTICS"]}
      >
        <div className="mx-auto w-full max-w-6xl px-6 py-32">
          {/* text lives in the LEFT column; the node graph fills the right half */}
          <div className="md:w-1/2 md:pr-10">
          <Reveal>
            <span className="text-[12px] font-semibold uppercase tracking-[0.3em] text-muted">
              01 — your AI CMO
            </span>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 className="mt-6 max-w-3xl text-[clamp(2.2rem,5.5vw,4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
              A month of marketing data in.{" "}
              <em className="text-gradient italic">One clear move out.</em>
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              mrk18 reads every channel, finds what&apos;s actually driving sales, and hands you the
              next move — in plain language. No dashboards to decode, no agency to chase.
            </p>
          </Reveal>
          </div>
        </div>
      </HeroBackground>
    </section>
  );
}
