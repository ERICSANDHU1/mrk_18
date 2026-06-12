import Reveal from "../ui/Reveal";
import TiltCard from "../ui/TiltCard";
import Marquee from "../Marquee";

const FEATURES = [
  {
    num: "01",
    title: "Reads your real numbers",
    pills: ["GA4", "ad platforms", "CRM", "email"],
  },
  {
    num: "02",
    title: "Tells the bitter truth",
    pills: ["weekly", "honest", "actionable"],
  },
  {
    num: "03",
    title: "A decision, not a chart",
    pills: ["1 move/week", "plain English"],
  },
  {
    num: "04",
    title: "Built India-first",
    pills: ["solo-founder", "budget-aware"],
  },
];

const INTEGRATIONS = [
  "Google Ads",
  "Meta",
  "LinkedIn",
  "GA4",
  "HubSpot",
  "Mailchimp",
  "Stripe",
  "Notion",
];

export default function Features() {
  return (
    <section id="features" className="relative py-32">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <span className="text-[12px] font-semibold uppercase tracking-[0.3em] text-muted">
            03 — Features
          </span>
          <h2 className="mt-6 text-[clamp(2.2rem,5.5vw,4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
            Built to find <span className="text-gradient">leaking money.</span>
          </h2>
        </Reveal>

        <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2">
          {FEATURES.map((f, i) => (
            <Reveal key={f.num} delay={i * 0.08}>
              <TiltCard className="p-9">
                <span className="text-gradient text-sm font-extrabold tracking-[0.3em]">{f.num}</span>
                <h3 className="mt-4 text-2xl font-extrabold tracking-tight md:text-3xl">{f.title}</h3>
                <div className="mt-6 flex flex-wrap gap-2.5">
                  {f.pills.map((pill) => (
                    <span
                      key={pill}
                      className="rounded-full border border-stroke px-4 py-1.5 text-[12.5px] text-muted"
                    >
                      {pill}
                    </span>
                  ))}
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </div>

      {/* integrations marquee */}
      <div className="mt-20">
        <Marquee items={INTEGRATIONS} variant="subtle" />
      </div>
    </section>
  );
}
