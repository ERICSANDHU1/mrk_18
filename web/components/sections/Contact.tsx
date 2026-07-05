import Reveal from "../ui/Reveal";

export default function Contact() {
  return (
    <section id="waitlist" className="relative px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <span className="inline-flex items-center gap-2.5 rounded-full border border-stroke px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-muted">
            <span className="pulse-dot h-2 w-2 rounded-full bg-green-400" />
            now onboarding founders
          </span>
        </Reveal>

        <Reveal delay={0.1}>
          <a
            href="/sign-up"
            data-text="GET STARTED"
            className="fill-on-hover mt-10 block text-[clamp(2.6rem,8.5vw,7.5rem)] font-extrabold leading-[1.02] tracking-[-0.03em]"
          >
            GET STARTED
          </a>
        </Reveal>

      </div>
    </section>
  );
}
