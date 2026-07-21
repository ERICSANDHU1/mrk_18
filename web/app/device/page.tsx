import type { Metadata } from "next";
import {
  Brain,
  Camera,
  Handshake,
  MapPin,
  Mic,
  Radar,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/sections/Footer";
import MrkWaitlistCta from "@/components/device/MrkWaitlistCta";
import DeviceShowcase from "@/components/device/DeviceShowcase";
import SmoothScroll from "@/components/SmoothScroll";

export const metadata: Metadata = {
  title: "mrk — the device",
  description:
    "mrk is three things in one glossy puck: a mic that hears your meetings, a camera that sees the room, and the CMO agent, carried everywhere you go. Launching after the Founding 500.",
};

// The device's three organs — ears, eyes, brain. Copy stays inside what the
// product docs actually promise (camera is a later version; no invented specs).
const SENSES = [
  {
    icon: Mic,
    kicker: "01 · Mic",
    title: "It hears the room.",
    body: "Wakes on speech — no button to press. mrk sits through your meeting, catches what was actually said, and whispers the correction in your ear before you agree to a bad number.",
    points: [
      "Wake-on-speech, zero setup",
      "Live corrections, in your ear",
      "After: minutes + who was right",
    ],
  },
  {
    icon: Camera,
    kicker: "02 · Camera",
    title: "It sees what you see.",
    soon: "V2",
    body: "The whiteboard, the deck on screen, the room itself — vision gives your brief context that audio alone can't carry. Arriving in a later version of the device.",
    points: [
      "Reads whiteboards & slides",
      "Context woven into your brief",
      "Indicator light whenever it's on",
    ],
  },
];

const AGENT_POINTS = [
  "Knows your company, goals and numbers",
  "Bitter-truth advice, anywhere you are",
  "Powers the Handshake in every room",
];

const HANDSHAKE = [
  {
    icon: Radar,
    title: "Proximity radar",
    body: "Walk into a 1,000-person room and mrk quietly senses every other mrk around you — mapping the crowd in real time.",
  },
  {
    icon: Sparkles,
    title: "Like-minded matching",
    body: "It reads what each holder is building and surfaces the founders, investors and developers actually aligned with you.",
  },
  {
    icon: MapPin,
    title: "Who's close to you",
    body: "Out of 100 mrks in the room, it points to the handful standing near you that you should meet right now.",
  },
  {
    icon: Handshake,
    title: "Curated intros, not cold rooms",
    body: "Turns a packed conference into a shortlist — walk up to the right person instead of working the whole floor.",
  },
  {
    icon: Users,
    title: "Founders · investors · devs",
    body: "Raising, scouting or hiring — mrk connects you to the right minds within reach, wherever your people gather.",
  },
  {
    icon: Zap,
    title: "A tap when they're near",
    body: "Its face nudges you the moment someone worth knowing comes into range. Glanceable — no staring at a screen.",
  },
];

export default function DevicePage() {
  return (
    // Lenis (same as the landing) is what makes the showcase's scroll-driven
    // explode advance: this page's body is the scroll container, not the window,
    // so framer's useScroll sees nothing without it.
    <SmoothScroll>
      <div className="theme-sand relative flex min-h-dvh flex-col">
        {/* same bone/greige backdrop as the landing */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-30 bg-[linear-gradient(105deg,#d3ccbb_0%,#dcd6c6_50%,#e5dfd1_100%)]"
        />
        <Navbar subpage />

      {/* waitlist FOMO bar — also mounts the Founding-500 modal that the
          showcase's "Reserve a seat" CTA opens */}
      <div className="mx-auto w-full max-w-5xl px-5 pt-24">
        <MrkWaitlistCta />
      </div>

      {/* the scroll-driven exploded device — the page's hero, exactly as it ran
          on the landing before: an assembled puck that fans apart into its nine
          labelled layers as you scroll. Full-bleed so the horizontal explode has
          room; falls back to a static shot on mobile. */}
      <DeviceShowcase />

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-16 pt-8">
        {/* ── WHAT'S INSIDE ── */}
        <div id="inside" className="scroll-mt-24">
          <p className="font-data text-[10px] uppercase tracking-[0.2em] text-mute-2">
            What&apos;s inside
          </p>
          <h2 className="font-display mt-1.5 text-[24px] leading-tight text-ink">
            Three organs. One puck.
          </h2>
        </div>

        {/* the senses — ears + eyes, side by side */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {SENSES.map(({ icon: Icon, kicker, title, body, points, soon }) => (
            <div
              key={kicker}
              className="flex flex-col rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-molten/40"
            >
              <div className="flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-molten/25 bg-molten/[0.08] text-molten">
                  <Icon size={20} aria-hidden />
                </span>
                {soon && (
                  <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-mute-2">
                    {soon}
                  </span>
                )}
              </div>
              <p className="font-data mt-4 text-[10px] uppercase tracking-[0.2em] text-mute-2">
                {kicker}
              </p>
              <h3 className="font-display mt-1 text-[19px] leading-snug text-ink">{title}</h3>
              <p className="mt-2 flex-1 text-[12.5px] leading-relaxed text-mute">{body}</p>
              <ul className="mt-4 space-y-1.5 border-t border-line pt-3">
                {points.map((pt) => (
                  <li key={pt} className="flex items-center gap-2 text-[12px] text-ink/85">
                    <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-molten" />
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* the brain — full width, the organ the other two feed */}
        <div className="mt-3 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-molten/40 sm:p-6">
          <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
            <div className="flex gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-molten/25 bg-molten/[0.08] text-molten">
                <Brain size={20} aria-hidden />
              </span>
              <div>
                <p className="font-data text-[10px] uppercase tracking-[0.2em] text-mute-2">
                  03 · Agent
                </p>
                <h3 className="font-display mt-1 text-[21px] leading-snug text-ink">
                  The CMO lives inside.
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-mute">
                  The same bitter-truth agent from your dashboard — everything the mic hears and the
                  camera sees lands in a brain that already knows your business. Ask it anything on
                  the move; it answers like someone with skin in your game.
                </p>
              </div>
            </div>
            <ul className="space-y-2.5 border-t border-line pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-1">
              {AGENT_POINTS.map((pt) => (
                <li key={pt} className="flex items-center gap-2 text-[12.5px] text-ink/85">
                  <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-molten" />
                  {pt}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* privacy, honestly — the trust line that makes a listening device sellable */}
        <div className="mt-3 flex items-start gap-3 rounded-2xl border border-line bg-surface-2/50 px-4 py-3.5">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-good" aria-hidden />
          <p className="text-[12.5px] leading-relaxed text-mute">
            <span className="font-semibold text-ink">Private by design.</span> An indicator shows
            whenever mrk is listening or capturing, you control when it&apos;s on, and intros only
            happen when both people opt in. No covert mode — ever.
          </p>
        </div>

        {/* ── THE HANDSHAKE ── */}
        <div className="mt-14">
          <p className="font-data text-[10px] uppercase tracking-[0.2em] text-mute-2">
            The Handshake
          </p>
          <h2 className="font-display mt-1.5 text-[24px] leading-tight text-ink">
            A radar for your people.
          </h2>
          <p className="mt-1.5 max-w-lg text-[13px] leading-relaxed text-mute">
            What the agent does the moment you walk into a room full of founders, investors and
            builders.
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {HANDSHAKE.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-line bg-surface p-4">
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-molten/20 bg-molten/[0.07] text-molten">
                <Icon size={17} aria-hidden />
              </span>
              <h3 className="mt-3 text-[14px] font-bold text-ink">{title}</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-mute">{body}</p>
            </div>
          ))}
        </div>
      </main>

        <Footer />
      </div>
    </SmoothScroll>
  );
}
