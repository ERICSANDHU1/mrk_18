"use client";

import { Check, Cpu, Sparkles } from "lucide-react";
import Navbar from "@/components/Navbar";
import Waitlist from "@/components/sections/Waitlist";

/** The upgrade page reached from the locked Comrk / Chief tabs (and the taster's
 *  Unlock CTA). Three tiers, each with an Apply button that opens the same
 *  application form (the Founding-500 modal, via the shared window event). */

const openApply = () => window.dispatchEvent(new Event("mrk18:open-waitlist"));

type Tier = {
  name: string;
  price: string;
  period?: string;
  was?: string;
  badge?: string;
  tagline: string;
  features: string[];
  highlight?: boolean;
  icon?: typeof Sparkles;
};

const TIERS: Tier[] = [
  {
    name: "Pro",
    price: "$15",
    period: "/mo",
    was: "$30",
    tagline: "Your AI CMO — it advises, examines your numbers, and executes with your approval.",
    features: [
      "Comrk execution pipeline",
      "Chief analytics command center",
      "Reads your real numbers every week",
      "Content written + staged for your approval",
    ],
    icon: Sparkles,
  },
  {
    name: "Max",
    price: "$25",
    period: "/mo",
    was: "$50",
    badge: "Founding 500 only",
    tagline: "Everything in Pro — plus the mrk device: your CMO's ears and brain, in your pocket.",
    features: [
      "Everything in Pro",
      "The mrk hardware device (mic + agent)",
      "Priority model access",
      "Founder pricing locked for life",
    ],
    highlight: true,
    icon: Cpu,
  },
  {
    name: "Enterprise",
    price: "Custom",
    tagline: "For agencies and teams automating ad ops across many clients.",
    features: [
      "Multi-client workspaces",
      "Automate your clients' ad operations",
      "White-glove onboarding",
      "Volume pricing + SLA",
    ],
  },
];

export default function PricingPage() {
  return (
    <div className="theme-sand taster-scope relative flex min-h-dvh flex-col">
      {/* theme-aware backdrop (light sand ↔ dark) — same var the taster uses, so
          the Appearance toggle flips this page between light/dark/system too */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-30 bg-[image:var(--taster-bg)]"
      />
      <Navbar subpage appearance />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-20 pt-28">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-molten/30 bg-molten/[0.06] px-3.5 py-1.5 text-[12px] font-bold uppercase tracking-wide text-molten">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-molten opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-molten" />
            </span>
            Founder pricing · closes at 500
          </span>
          <h1
            className="mx-auto mt-5 max-w-3xl text-[clamp(2rem,5vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-ink"
            style={{ fontFamily: "var(--font-claude-serif), Georgia, serif" }}
          >
            Put the full CMO to work.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
            The taster is ~10% of the brain. Pick how much of the rest you want running your
            marketing — advice, watchdog, and execution.
          </p>
        </div>

        <div className="mt-14 grid items-stretch gap-5 lg:grid-cols-3">
          {TIERS.map((t) => {
            const Icon = t.icon;
            return (
              <div
                key={t.name}
                className={`glass relative flex flex-col rounded-3xl p-7 ${
                  t.highlight ? "ring-2 ring-molten/50" : ""
                }`}
              >
                {t.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[10.5px] font-bold uppercase tracking-wide text-[color:var(--cta-ink,#fff)]"
                    style={{ background: "var(--gradient-brand)" }}
                  >
                    {t.badge}
                  </span>
                )}

                <div className="flex items-center gap-2">
                  {Icon && (
                    <span className="grid h-9 w-9 place-items-center rounded-xl border border-molten/25 bg-molten/[0.08] text-molten">
                      <Icon size={17} aria-hidden />
                    </span>
                  )}
                  <h2 className="text-[19px] font-bold text-ink">{t.name}</h2>
                </div>

                <div className="mt-5 flex items-baseline gap-2">
                  <span
                    className="text-[34px] font-extrabold leading-none text-ink"
                    style={{ fontFamily: "var(--font-claude-serif), Georgia, serif" }}
                  >
                    {t.price}
                  </span>
                  {t.period && <span className="font-data text-[13px] text-muted">{t.period}</span>}
                  {t.was && (
                    <span className="font-data text-[13px] text-mute-2 line-through">{t.was}</span>
                  )}
                </div>

                <p className="mt-3 text-[13.5px] leading-relaxed text-muted">{t.tagline}</p>

                <ul className="mt-5 flex-1 space-y-2.5 border-t border-stroke pt-5">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13px] leading-snug text-ink">
                      <Check size={15} className="mt-0.5 shrink-0 text-molten" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={openApply}
                  className={`mt-7 w-full rounded-xl px-5 py-3 text-[14px] font-bold transition-shadow duration-300 ${
                    t.highlight
                      ? "text-[color:var(--cta-ink,#0a0a0b)] shadow-[0_10px_36px_var(--cta-glow,rgba(255,106,0,0.35))] hover:shadow-[0_14px_48px_var(--cta-glow-strong,rgba(255,106,0,0.5))]"
                      : "border border-stroke text-ink hover:border-molten/40"
                  }`}
                  style={t.highlight ? { background: "var(--gradient-brand)" } : undefined}
                >
                  Apply →
                </button>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-[12.5px] text-muted">
          Every plan starts with an application — Founder pricing is locked for life once you&apos;re in.
        </p>
      </main>

      {/* the application form — opened by any tier's Apply button */}
      <Waitlist />
    </div>
  );
}
