import Reveal from "../ui/Reveal";
import TiltCard from "../ui/TiltCard";

type Feat = { num: string; title: string; pills: string[] };

const FEATURES: Feat[] = [
  { num: "01", title: "Always listening", pills: ["wakes on speech", "zero setup", "no button to press"] },
  { num: "02", title: "Corrects you live", pills: ["someone asks, you know", "in your ear", "never caught off-guard"] },
  { num: "03", title: "The Handshake", pills: ["finds the room", "asks you both", "makes the intro"] },
  { num: "04", title: "Tells the bitter truth", pills: ["what really happened", "honest", "no sugar-coating"] },
  { num: "05", title: "Knows your context", pills: ["your company", "your goals", "advice that fits you"] },
  { num: "06", title: "Pocket-sized", pills: ["wear it all day", "barely there", "clips on"] },
];

function FeatureCard({ feat, big }: { feat: Feat; big?: boolean }) {
  return (
    <TiltCard className={`feature-glass rounded-3xl ${big ? "p-10 md:p-14" : "p-8 md:p-9"}`} max={big ? 4 : 7}>
      <div className="relative z-10">
        <span className="text-gradient text-sm font-extrabold tracking-[0.3em]">{feat.num}</span>
        <h3 className={`mt-3 font-extrabold tracking-tight ${big ? "text-3xl md:text-[2.6rem]" : "text-2xl md:text-[1.7rem]"}`}>
          {feat.title}
        </h3>
        <div className="mt-5 flex flex-wrap gap-2.5">
          {feat.pills.map((p) => (
            <span
              key={p}
              className="rounded-full border border-[rgba(27,24,21,0.26)] px-4 py-1.5 text-[12.5px] text-muted"
            >
              {p}
            </span>
          ))}
        </div>
      </div>
    </TiltCard>
  );
}

export default function Features() {
  return (
    <section id="features" className="relative px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <span className="text-[12px] font-semibold uppercase tracking-[0.3em] text-muted">03 — Features</span>
          <h2 className="mt-6 text-[clamp(2.2rem,5.5vw,4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
            Everything <span className="text-gradient">it does.</span>
          </h2>
        </Reveal>

        <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2">
          {FEATURES.map((f, i) => (
            <Reveal key={f.num} delay={(i % 2) * 0.08}>
              <FeatureCard feat={f} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
