import Reveal from "../ui/Reveal";
import LiquidGlassCards from "./LiquidGlassCards";

export default function HowItWorks() {
  return (
    <section id="how" className="relative px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <span className="text-[12px] font-semibold uppercase tracking-[0.3em] text-muted">
            02 — How it works
          </span>
          <h2 className="mt-6 text-[clamp(2.2rem,5.5vw,4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
            One brain. <span className="text-gradient">Three jobs.</span>
          </h2>
        </Reveal>

        {/* sticky stacking cards with the liquid-glass material */}
        <LiquidGlassCards />
      </div>
    </section>
  );
}
