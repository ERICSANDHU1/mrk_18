import type { Metadata } from "next";
import { Handshake, MapPin, Radar, Sparkles, Users, Zap } from "lucide-react";
import DeviceModel3D from "@/components/device/DeviceModel3D";

export const metadata: Metadata = { title: "mrk" };

const FEATURES = [
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

export default function MrkPage() {
  return (
    <div className="dash-scroll h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-5 py-8">
        {/* hero */}
        <div className="grid items-center gap-8 sm:grid-cols-[1.25fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-molten/30 bg-molten/[0.06] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-ink">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-molten opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-molten" />
              </span>
              mrk · coming soon
            </span>
            <h1 className="font-display mt-4 text-[clamp(2rem,4vw,2.8rem)] leading-[1.04] text-ink">
              Your CMO, in your pocket.
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-mute">
              A device that carries your CMO — and a{" "}
              <span className="font-semibold text-ink">proximity radar</span> for the people worth
              meeting. Walk into a 1,000-person room and mrk reads every other mrk around you, then
              tells you who&apos;s close, who&apos;s aligned, and who to actually go meet. Launching
              after the Founding 500.
            </p>
          </div>
          <div className="relative mx-auto aspect-square w-[min(74vw,340px)] cursor-grab active:cursor-grabbing">
            <DeviceModel3D />
          </div>
        </div>

        {/* how it works */}
        <h2 className="mt-12 text-[12px] font-semibold uppercase tracking-[0.18em] text-mute-2">
          How it works
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-line bg-surface p-4">
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-molten/20 bg-molten/[0.07] text-molten">
                <Icon size={17} aria-hidden />
              </span>
              <h3 className="mt-3 text-[14px] font-bold text-ink">{title}</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-mute">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
