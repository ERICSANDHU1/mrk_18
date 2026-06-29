import { Handshake, MapPin, Radar, Sparkles, Users, Zap } from "lucide-react";

/* The mrk device — "CMO in your pocket" — teased on the execution desk. Its real
   job is proximity networking: at a packed event it reads every other mrk nearby
   and surfaces the like-minded people worth walking up to. Launches after the
   Founding 500. */

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

export default function MrkShowcase() {
  return (
    <section className="relative mt-4 overflow-hidden rounded-2xl border border-molten/30 bg-gradient-to-b from-molten/[0.06] to-transparent p-5 sm:p-6">
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-molten to-ember" />

      <div className="flex flex-wrap items-center gap-3">
        <span
          className="grid h-9 w-9 place-items-center rounded-xl text-white"
          style={{ background: "var(--gradient-brand)" }}
        >
          <Radar size={18} aria-hidden />
        </span>
        <h2 className="font-display text-[22px] leading-none text-ink">mrk</h2>
        <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-mute-2">
          Coming soon
        </span>
      </div>

      <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-mute">
        Your CMO in your pocket — and a <span className="font-semibold text-ink">proximity radar</span> for the
        room. Drop into a 1,000-person event and mrk reads every other mrk around you, then tells you who&apos;s
        close, who&apos;s aligned, and who to actually go meet. Real-world networking, matched on proximity —
        launching after the Founding 500.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border border-line bg-surface p-4">
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-molten/20 bg-molten/[0.07] text-molten">
              <Icon size={16} aria-hidden />
            </span>
            <h3 className="mt-2.5 text-[13.5px] font-bold text-ink">{title}</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-mute">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
