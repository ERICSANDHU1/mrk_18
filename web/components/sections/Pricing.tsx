import Reveal from "../ui/Reveal";

const ROWS = [
  {
    name: "Founding 50",
    desc: "Early access · founder pricing locked",
    action: "Apply",
    href: "#waitlist",
    highlight: true,
  },
  {
    name: "Early access",
    desc: "Join the waitlist · first to onboard",
    action: "Free",
    href: "#waitlist",
    highlight: false,
  },
  {
    name: "Launch",
    desc: "Full AI CMO: advise + watchdog + execute",
    action: "Coming soon",
    href: undefined,
    highlight: false,
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="relative px-6 py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <span className="text-[12px] font-semibold uppercase tracking-[0.3em] text-muted">
            05 — Pricing
          </span>
          <h2 className="mt-6 text-[clamp(2.2rem,5.5vw,4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
            Start free. <span className="text-gradient">Lock founder pricing.</span>
          </h2>
        </Reveal>

        <Reveal delay={0.12}>
          <div className="mt-16 border-t border-stroke">
            {ROWS.map((row) => {
              const inner = (
                <div className="grid grid-cols-1 items-center gap-3 border-b border-stroke py-9 transition-transform duration-300 ease-out hover:translate-x-3 md:grid-cols-[1.2fr_2fr_auto]">
                  <h3 className={`text-2xl font-extrabold tracking-tight md:text-3xl ${row.highlight ? "text-gradient" : ""}`}>
                    {row.name}
                  </h3>
                  <p className="text-[15px] text-muted">{row.desc}</p>
                  <span
                    className={`justify-self-start rounded-full px-5 py-2 text-[13px] font-semibold md:justify-self-end ${
                      row.highlight
                        ? "text-[#0a0a0b]"
                        : "border border-stroke text-ink"
                    }`}
                    style={row.highlight ? { background: "var(--gradient-brand)" } : undefined}
                  >
                    {row.action}
                  </span>
                </div>
              );
              return row.href ? (
                <a key={row.name} href={row.href} className="block">
                  {inner}
                </a>
              ) : (
                <div key={row.name}>{inner}</div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
