import Reveal from "../ui/Reveal";
import TiltCard from "../ui/TiltCard";

type Feat = { num: string; title: string; pills: string[] };

const FEATURES: Feat[] = [
  { num: "01", title: "Reads your real numbers", pills: ["connects your analytics", "working vs leaking", "no guesswork"] },
  { num: "02", title: "Flags what's leaking money", pills: ["before it's a crisis", "watches weekly", "in plain language"] },
  { num: "03", title: "Hands you the next move", pills: ["one decision a week", "plain language", "not another report"] },
  { num: "04", title: "Writes your content", pills: ["LinkedIn · X · Instagram", "platform-native", "ready to ship"] },
  { num: "05", title: "You approve everything", pills: ["two approval gates", "nothing auto-ships", "silence = no"] },
  { num: "06", title: "Tells the bitter truth", pills: ["zero invented numbers", "no flattery", "what's really working"] },
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
