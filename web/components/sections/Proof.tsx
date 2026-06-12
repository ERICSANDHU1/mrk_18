import Reveal from "../ui/Reveal";

const QUOTES = [
  "Finally a tool that tells me what to do, not just what happened.",
  "Caught ₹40k/month leaking into a channel that never converted.",
  "The marketing co-founder I couldn't afford to hire.",
];

export default function Proof() {
  return (
    <section className="relative px-6 py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <span className="text-[12px] font-semibold uppercase tracking-[0.3em] text-muted">
            04 — What early founders say
          </span>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {QUOTES.map((quote, i) => (
            <Reveal key={i} delay={i * 0.1}>
              <figure className="glass flex h-full flex-col gap-6 rounded-2xl p-8">
                <span aria-hidden className="text-gradient text-2xl leading-none">
                  ◆
                </span>
                <blockquote className="text-lg leading-relaxed text-ink/90">
                  &ldquo;{quote}&rdquo;
                </blockquote>
                <figcaption className="mt-auto text-[11px] uppercase tracking-[0.24em] text-muted">
                  early access
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
