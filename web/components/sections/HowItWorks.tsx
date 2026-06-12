import Reveal from "../ui/Reveal";

const STEPS = [
  {
    num: "01",
    title: "ADVISE",
    line: "Tells you what to do next — and what to stop.",
    pills: ["ICP", "positioning", "channels"],
  },
  {
    num: "02",
    title: "WATCHDOG",
    line: "Watches weekly, flags what's leaking money before it's a crisis.",
    pills: ["spend", "CAC", "activation", "retention"],
  },
  {
    num: "03",
    title: "EXECUTE",
    line: "Helps run the work, so advice ships — not another report.",
    pills: ["copy", "creative", "scheduling", "approvals"],
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="relative px-6 py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <span className="text-[12px] font-semibold uppercase tracking-[0.3em] text-muted">
            02 — How it works
          </span>
          <h2 className="mt-6 text-[clamp(2.2rem,5.5vw,4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
            One brain. <span className="text-gradient">Three jobs.</span>
          </h2>
        </Reveal>

        {/* sticky stacking cards */}
        <div className="mt-16 space-y-8">
          {STEPS.map((step, i) => (
            <div
              key={step.num}
              className="glass sticky rounded-3xl p-10 md:p-14"
              style={{
                top: `calc(110px + ${i * 28}px)`,
                background: "rgba(20, 20, 22, 0.88)",
              }}
            >
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div>
                  <span className="text-gradient text-sm font-extrabold tracking-[0.3em]">
                    {step.num}
                  </span>
                  <h3 className="mt-3 text-4xl font-extrabold tracking-tight md:text-5xl">
                    {step.title}
                  </h3>
                  <p className="mt-5 max-w-md text-lg leading-relaxed text-muted">{step.line}</p>
                </div>
                <div className="flex max-w-xs flex-wrap gap-2.5 md:justify-end">
                  {step.pills.map((pill) => (
                    <span
                      key={pill}
                      className="rounded-full border border-stroke px-4 py-1.5 text-[12.5px] text-muted"
                    >
                      {pill}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
