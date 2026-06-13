import Reveal from "../ui/Reveal";

const CARDS = [
  { label: "Email", value: "mrk18ai@gmail.com", href: "mailto:mrk18ai@gmail.com" },
  { label: "LinkedIn", value: "mrk ai", href: "https://www.linkedin.com/in/mrk-ai-4a78a9409" },
];

export default function Contact() {
  return (
    <section id="waitlist" className="relative px-6 py-36">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <span className="inline-flex items-center gap-2.5 rounded-full border border-stroke px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-muted">
            <span className="pulse-dot h-2 w-2 rounded-full bg-green-400" />
            now onboarding founders
          </span>
        </Reveal>

        <Reveal delay={0.1}>
          <a
            href="mailto:mrk18ai@gmail.com"
            data-text="JOIN THE WAITLIST"
            className="fill-on-hover mt-10 block text-[clamp(2.6rem,8.5vw,7.5rem)] font-extrabold leading-[1.02] tracking-[-0.03em]"
          >
            JOIN THE WAITLIST
          </a>
        </Reveal>

        <div className="mt-20 grid grid-cols-1 gap-6 md:grid-cols-2">
          {CARDS.map((card, i) => (
            <Reveal key={card.label} delay={0.15 + i * 0.08}>
              <a
                href={card.href}
                target={card.href.startsWith("http") ? "_blank" : undefined}
                rel={card.href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="glass group block rounded-2xl p-7 transition-colors duration-300 hover:border-amber/40"
              >
                <span className="text-[11px] uppercase tracking-[0.24em] text-muted">
                  {card.label}
                </span>
                <span className="mt-3 block text-lg font-semibold text-ink transition-colors duration-300 group-hover:text-amber">
                  {card.value}
                </span>
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
