import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Brain, Camera, Mic } from "lucide-react";
import Reveal from "../ui/Reveal";

/** Landing teaser for the mrk hardware — section 05. Deliberately a taster, not
 *  the whole story: three organs, one line each, and a link to the full /device
 *  page. Keeps the device out of the app rail and gives it its own front door. */
const ORGANS = [
  { icon: Mic, label: "Mic", line: "Hears the room, whispers the correction in your ear." },
  { icon: Camera, label: "Camera", tag: "V2", line: "Reads the whiteboard and the deck for context." },
  { icon: Brain, label: "Agent", line: "Your CMO's brain, carried everywhere you go." },
];

export default function Device() {
  return (
    <section id="device" className="relative px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <span className="text-[12px] font-semibold uppercase tracking-[0.3em] text-muted">
            05 — The device
          </span>
          <h2 className="mt-6 text-[clamp(2.2rem,5.5vw,4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
            Your CMO, <span className="text-gradient">in your pocket.</span>
          </h2>
        </Reveal>

        <Reveal delay={0.12}>
          <div className="mt-12 grid items-center gap-8 rounded-3xl border border-stroke bg-surface/60 p-6 sm:p-10 lg:grid-cols-[1fr_1.1fr]">
            {/* the puck, on its aura */}
            <div className="relative mx-auto aspect-square w-[min(72vw,360px)]">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-[8%] rounded-full bg-molten/10 blur-[80px]"
              />
              <Image
                src="/device/new-smile.png"
                alt="the mrk device"
                fill
                sizes="(max-width: 1024px) 72vw, 360px"
                className="object-contain drop-shadow-2xl"
              />
            </div>

            <div>
              <p className="max-w-md text-[16px] leading-relaxed text-muted">
                mrk is three things in one glossy puck — a mic that hears your meetings, a camera
                that sees the room, and the agent that already knows your business.
              </p>

              <ul className="mt-6 space-y-3">
                {ORGANS.map(({ icon: Icon, label, tag, line }) => (
                  <li key={label} className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-molten/25 bg-molten/[0.08] text-molten">
                      <Icon size={17} aria-hidden />
                    </span>
                    <span className="text-[14px] leading-snug text-ink">
                      <span className="font-bold">{label}</span>
                      {tag && (
                        <span className="font-data ml-1.5 text-[10px] uppercase tracking-wide text-mute-2">
                          {tag}
                        </span>
                      )}
                      <span className="block text-[13px] text-muted">{line}</span>
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href="/device"
                className="mt-8 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14px] font-bold text-[color:var(--cta-ink,#fff)] shadow-[0_10px_36px_var(--cta-glow,rgba(255,106,0,0.35))] transition-shadow duration-300 hover:shadow-[0_14px_48px_var(--cta-glow-strong,rgba(255,106,0,0.5))]"
                style={{ background: "var(--gradient-brand)" }}
              >
                Explore the device <ArrowRight size={16} aria-hidden />
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
