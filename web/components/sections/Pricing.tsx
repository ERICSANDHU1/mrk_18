import Reveal from "../ui/Reveal";
import Waitlist, { WaitlistTrigger } from "./Waitlist";

const ROWS = [
  {
    name: "Founding 500",
    desc: "Founder pricing locked for life · filling fast",
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
    <section id="pricing" className="relative px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <span className="text-[12px] font-semibold uppercase tracking-[0.3em] text-muted">
            05 — Pricing
          </span>
          <h2 className="mt-6 text-[clamp(2.2rem,5.5vw,4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
            Start free. <span className="text-gradient">Lock founder pricing.</span>
          </h2>
          <div className="mt-7 flex flex-col items-start gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-molten/30 bg-molten/[0.06] px-3.5 py-1.5 text-[12.5px] font-bold uppercase tracking-wide text-ink">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-molten opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-molten" />
              </span>
              Only 500 founder seats — filling fast
            </span>
            <p className="max-w-xl text-[15px] leading-relaxed text-muted">
              Founder pricing locks for life. Once the Founding 500 are in, this door closes —
              everyone after pays full launch price.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.12}>
          <div className="mt-16 border-t border-stroke">
            {ROWS.map((row) => (
              <div
                key={row.name}
                className="grid grid-cols-1 items-center gap-3 border-b border-stroke py-9 transition-transform duration-300 ease-out hover:translate-x-3 md:grid-cols-[1.2fr_2fr_auto]"
              >
                <h3 className={`text-2xl font-extrabold tracking-tight md:text-3xl ${row.highlight ? "text-gradient" : ""}`}>
                  {row.name}
                </h3>
                <p className="text-[15px] text-muted">{row.desc}</p>
                {row.href === "#waitlist" ? (
                  <WaitlistTrigger highlight={row.highlight}>{row.action}</WaitlistTrigger>
                ) : (
                  <span className="justify-self-start rounded-full border border-stroke px-5 py-2 text-[13px] font-semibold text-ink md:justify-self-end">
                    {row.action}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Reveal>
      </div>
      <Waitlist />
    </section>
  );
}
