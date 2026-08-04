"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUp, Crown, Gauge, Lock, Megaphone, PenLine, ScanSearch, Sparkles, Workflow } from "lucide-react";
import Navbar from "@/components/Navbar";
import AdAudit from "@/components/taster/AdAudit";
import Waitlist from "@/components/sections/Waitlist";

/** The unified Studio — one hero URL runs BOTH the taster (the sharp company
 *  read) and the Business DNA (real brand kit), then lays them out together with
 *  the CMO agent sidebar. Anonymous: the whole read is free; Create Campaigns is
 *  the conversion. Signed-in visitors get their DNA linked to their account. */

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000";

type Rival = { name: string; lane: string };
type VerdictCard = {
  verdict: string;
  points?: string[];
  score?: number | null;
  rivals?: Rival[];
  motion?: string;
  primary_channel?: string;
};
type Taster = {
  domain: string;
  company?: string;
  offer?: string;
  results: { usp: VerdictCard; differentiation: VerdictCard; gtm: VerdictCard };
  key_insights?: string[];
  quick_wins?: string[];
  positioning?: string;
  competitors?: string[];
  sample?: boolean;
};
type DNA = {
  domain: string;
  source_url: string;
  logo_url?: string;
  business_overview: string;
  tagline: string;
  aesthetic_tags: string[];
  tone_tags: string[];
  brand_values: string[];
  colors: string[];
  heading_font?: string;
  body_font?: string;
  brand_kit?: string;
};

const CARDS = [
  { key: "usp", title: "USP", hint: "the one thing you actually own" },
  { key: "differentiation", title: "Competition", hint: "your edge vs. who you're up against" },
  { key: "gtm", title: "GTM Strategy", hint: "how you reach your first customers" },
] as const;

const STEPS = [
  { label: "Reading the site", at: 0 },
  { label: "Pulling your real brand kit", at: 3 },
  { label: "Discovering real competitors", at: 6 },
  { label: "Writing your verdict", at: 11 },
  { label: "Assembling your Studio", at: 16 },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Dial({ value }: { value: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 72 72" width="60" height="60" role="img" aria-label={`overall ${value} of 100`}>
      <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(27,24,21,0.1)" strokeWidth="6" />
      <circle
        cx="36" cy="36" r={r} fill="none" stroke="var(--amber)" strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${(value / 100) * c} ${c}`} transform="rotate(-90 36 36)"
      />
      <text x="36" y="43" textAnchor="middle" fontSize="19" fontWeight="800" fill="var(--ink)">{value}</text>
    </svg>
  );
}

function Score({ value }: { value?: number | null }) {
  if (typeof value !== "number") return null;
  return (
    <div className="flex shrink-0 items-center gap-1.5" aria-label={`graded ${value} of 100`}>
      <div className="h-1 w-11 overflow-hidden rounded-full bg-[var(--track)]">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: "var(--gradient-brand)" }} />
      </div>
      <span className="text-[12px] font-extrabold tabular-nums text-ink">{value}</span>
    </div>
  );
}

/** Brand mark — the site's real logo when it renders cleanly, else a branded
 *  initial. The studio card is DARK, so we tile the logo on a dark surface (not a
 *  white square): Brandfetch's default `theme/light` is the LIGHT/white logo made
 *  for dark backgrounds, so a brand's white wordmark shows instead of vanishing —
 *  and a broken/missing logo falls back to the branded letter. */
function BrandLogo({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const letter = (name.trim()[0] || "?").toUpperCase();
  const url = src;
  if (!url || failed) {
    return (
      <span
        className="grid h-13 w-13 shrink-0 place-items-center rounded-xl text-[22px] font-extrabold text-[color:var(--cta-ink,#fff)]"
        style={{ background: "var(--gradient-brand)" }}
        aria-hidden
      >
        {letter}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={`${name} logo`}
      width={52}
      height={52}
      className="h-13 w-13 shrink-0 rounded-xl border border-stroke bg-white/[0.06] object-contain p-1.5"
      onError={() => setFailed(true)}
    />
  );
}

export default function StudioExperience({ domain }: { domain: string }) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();
  const { getToken } = useAuth();

  const [phase, setPhase] = useState<"loading" | "error" | "done">("loading");
  const [taster, setTaster] = useState<Taster | null>(null);
  const [dna, setDna] = useState<DNA | null>(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const ran = useRef(false);

  useEffect(() => {
    if (phase !== "loading") return;
    const t = setInterval(() => setElapsed((e) => e + 0.5), 500);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      const token = await getToken().catch(() => null);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const body = JSON.stringify({ url: domain });

      // taster can 503 while the engine warms — retry it; DNA is quick.
      const dnaP = fetch(`${BACKEND}/studio/dna`, { method: "POST", headers, body })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

      let tasterData: Taster | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        let res: Response;
        try {
          res = await fetch(`${BACKEND}/taster`, { method: "POST", headers, body });
        } catch {
          setError("We couldn't reach the analysis engine — try again in a minute.");
          setPhase("error");
          return;
        }
        if (res.status === 503 && attempt < 2) {
          await sleep(25_000);
          continue;
        }
        const b = await res.json().catch(() => null);
        if (res.ok && b?.results) tasterData = b as Taster;
        else {
          setError(typeof b?.detail === "string" ? b.detail : "Something broke — try again in a minute.");
          setPhase("error");
          return;
        }
        break;
      }

      setDna((await dnaP) as DNA | null);
      setTaster(tasterData);
      setPhase("done");
    })();
  }, [domain, getToken]);

  const step = STEPS.filter((s) => elapsed >= s.at).length - 1;
  const graded = taster
    ? CARDS.map((c) => ({
        label: c.title === "GTM Strategy" ? "GTM" : c.title,
        score: taster.results[c.key]?.score,
      })).filter((g): g is { label: string; score: number } => typeof g.score === "number")
    : [];
  const overall = graded.length
    ? Math.round(graded.reduce((a, g) => a + g.score, 0) / graded.length)
    : null;
  const weakest = graded.length ? graded.reduce((lo, g) => (g.score < lo.score ? g : lo)) : null;
  const brand = taster?.company || dna?.domain?.replace(/\.(com|io|ai|co|in|app|dev|org|net).*$/i, "") || domain;

  return (
    <div className="theme-sand taster-scope min-h-screen">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-30 bg-[image:var(--taster-bg)]" />
      {/* hairline grid — same as the taster/hero, fading out from the top */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-20">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--taster-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--taster-grid)_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
      </div>
      <Navbar subpage appearance unlock />

      <main className="mx-auto w-full max-w-[1400px] px-5 pb-28 pt-24">
        {phase === "loading" && (
          <div className="grid min-h-[70vh] place-items-center">
            <div className="glass w-full max-w-md rounded-2xl p-7">
              <h1 className="font-serif text-[20px] font-bold text-ink">Reading {domain} cold</h1>
              <p className="mt-0.5 text-[12.5px] text-muted">your verdict + your brand kit · free · ~60s</p>
              <ol className="mt-6 space-y-3">
                {STEPS.map((s, i) => {
                  const state = i < step ? "done" : i === step ? "now" : "todo";
                  return (
                    <li key={s.label} className="flex items-center gap-3">
                      <span
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[color:var(--cta-ink,#fff)] ${
                          state === "todo" ? "border border-stroke" : ""
                        } ${state === "now" && !reduce ? "animate-pulse" : ""}`}
                        style={state === "todo" ? undefined : { background: "var(--gradient-brand)" }}
                      >
                        {state === "done" ? "✓" : ""}
                      </span>
                      <span className={`text-[13.5px] ${state === "todo" ? "text-muted" : "font-semibold text-ink"}`}>
                        {s.label}{state === "now" ? "…" : ""}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="grid min-h-[70vh] place-items-center">
            <div className="glass w-full max-w-md rounded-2xl p-8 text-center">
              <h1 className="text-[19px] font-bold text-ink">Couldn&apos;t finish the read</h1>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">{error}</p>
              <Link href="/" className="mt-6 inline-block rounded-2xl px-6 py-3 text-[13.5px] font-semibold text-[color:var(--cta-ink,#0a0a0b)]" style={{ background: "var(--gradient-brand)" }}>
                Try another URL
              </Link>
            </div>
          </div>
        )}

        {phase === "done" && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_356px]">
            {/* ── LEFT: the full read (verdict + DNA) ─────────────────── */}
            <div className="min-w-0 space-y-5">
              {/* brand header */}
              <div className="glass flex flex-wrap items-center gap-4 rounded-2xl p-5">
                <BrandLogo src={dna?.logo_url} name={brand} />
                <div className="min-w-0 flex-1">
                  <h1 className="font-serif text-[24px] font-bold capitalize leading-tight text-ink">{brand}</h1>
                  <a href={`https://${domain}`} target="_blank" rel="noreferrer" className="text-[12.5px] text-muted hover:text-ink">{domain} ↗</a>
                </div>
                {overall !== null && (
                  <div className="flex items-center gap-3">
                    <Dial value={overall} />
                    <div className="min-w-0 max-w-[260px]">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
                        The CMO&apos;s grade
                      </p>
                      <p className="text-[13px] font-bold leading-tight text-ink">
                        {overall}
                        <span className="text-mute-2">/100</span> · overall grade
                      </p>
                      <p className="mt-0.5 text-[10.5px] leading-snug text-muted">
                        Average of{" "}
                        {graded.map((g, i) => (
                          <span key={g.label}>
                            {g.label}{" "}
                            <span
                              className={
                                g.label === weakest?.label ? "font-bold text-bad" : "font-semibold text-ink"
                              }
                            >
                              {g.score}
                            </span>
                            {i < graded.length - 1 ? " · " : ""}
                          </span>
                        ))}
                        {weakest && (
                          <>
                            {" "}
                            — weakest is {weakest.label}, fix it first.
                          </>
                        )}
                      </p>
                      <p className="mt-0.5 text-[10px] leading-snug text-mute-2">
                        A judgment, not a metric · 50s = mediocre, 80+ is rare
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {taster?.positioning && (
                <div className="glass rounded-2xl p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-mute-2">How I&apos;d say it</p>
                  <p className="mt-1.5 font-serif text-[19px] font-semibold italic leading-snug text-molten">“{taster.positioning}”</p>
                  <p className="mt-1 text-[10.5px] text-muted">the homepage headline your CMO would run</p>
                </div>
              )}

              {/* verdict cards */}
              {taster && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {CARDS.map((card, i) => {
                    const v = taster.results[card.key];
                    if (!v) return null;
                    return (
                      <motion.article
                        key={card.key}
                        initial={{ opacity: 0, y: reduce ? 0 : 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: reduce ? 0 : i * 0.08, duration: 0.4 }}
                        className="glass rounded-2xl p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-[13.5px] font-bold text-ink">{card.title}</h3>
                            <p className="text-[10px] text-muted">{card.hint}</p>
                          </div>
                          <Score value={v.score} />
                        </div>
                        <p className="mt-2.5 font-serif text-[14.5px] font-semibold leading-snug text-ink">{v.verdict}</p>
                        {card.key === "gtm" && (v.motion || v.primary_channel) && (
                          <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-stroke pt-2.5">
                            {v.motion && <span className="rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase text-[color:var(--cta-ink,#fff)]" style={{ background: "var(--gradient-brand)" }}>{v.motion}</span>}
                            {v.primary_channel && <span className="text-[11.5px] font-semibold text-ink">→ {v.primary_channel}</span>}
                          </div>
                        )}
                        {card.key === "differentiation" && (v.rivals?.length ?? 0) > 0 && (
                          <ul className="mt-2.5 space-y-1.5 border-t border-stroke pt-2.5">
                            {v.rivals!.map((r) => (
                              <li key={r.name} className="flex items-center gap-2">
                                <span className="grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] font-bold text-[color:var(--cta-ink,#fff)]" style={{ background: "var(--gradient-brand)" }}>{r.name.charAt(0).toUpperCase()}</span>
                                <span className="shrink-0 text-[12px] font-bold text-ink">{r.name}</span>
                                <span className="truncate text-[11px] text-muted">{r.lane}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {(v.points?.length ?? 0) > 0 && (
                          <ul className="mt-2.5 space-y-1.5">
                            {v.points!.map((p) => (
                              <li key={p} className="flex gap-2 text-[12px] leading-relaxed text-ink/85">
                                <span className="mt-[7px] h-1 w-2.5 shrink-0 rounded-full" style={{ background: "var(--gradient-brand)" }} />
                                {p}
                              </li>
                            ))}
                          </ul>
                        )}
                      </motion.article>
                    );
                  })}

                  {/* 4th cell — the Ad Analytics Interpreter. On this free/anon read
                      the CTA funnels to sign-up; the actual audit tool lives in the
                      app (Chief → Analytics interpreter) once they're in. */}
                  <AdAudit
                    brandContext={brand}
                    variant="card"
                    onGate={() =>
                      router.push(isLoaded && isSignedIn ? "/chief/analytics" : "/sign-up")
                    }
                  />
                </div>
              )}

              {/* competitors + insights + quick wins */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {(taster?.competitors?.length ?? 0) > 0 && (
                  <div className="glass rounded-2xl p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-mute-2">Competitors discovered</p>
                    <ul className="mt-2.5 space-y-2">
                      {taster!.competitors!.map((c) => (
                        <li key={c} className="flex items-center gap-2">
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-bold text-[color:var(--cta-ink,#fff)]" style={{ background: "var(--gradient-brand)" }}>{c.charAt(0).toUpperCase()}</span>
                          <span className="text-[12.5px] font-semibold text-ink">{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(taster?.key_insights?.length ?? 0) > 0 && (
                  <div className="glass rounded-2xl p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-mute-2">Key insights</p>
                    <ul className="mt-2.5 space-y-2">
                      {taster!.key_insights!.map((x) => (
                        <li key={x} className="flex gap-2"><span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--gradient-brand)" }} /><span className="text-[12px] font-medium leading-snug text-ink">{x}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
                {(taster?.quick_wins?.length ?? 0) > 0 && (
                  <div className="glass rounded-2xl p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-mute-2">Quick wins this week</p>
                    <ol className="mt-2.5 space-y-2">
                      {taster!.quick_wins!.map((w, i) => (
                        <li key={w} className="flex gap-2"><span className="grid h-4.5 w-4.5 mt-[1px] shrink-0 place-items-center rounded-md text-[10px] font-bold text-[color:var(--cta-ink,#fff)]" style={{ background: "var(--gradient-brand)" }}>{i + 1}</span><span className="text-[12px] font-medium leading-snug text-ink">{w}</span></li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>

            </div>

            {/* ── RIGHT: what the mrk18 CMO actually does ──────────────── */}
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <CmoPitch onUnlock={() => router.push(isLoaded && isSignedIn ? "/chat" : "/sign-up")} />
            </aside>
          </div>
        )}
      </main>

      {/* fixed chat box — clicking funnels to sign-in; signed-in → the app chat */}
      {phase === "done" && (
        <GatedChat onOpen={() => router.push(isLoaded && isSignedIn ? "/chat" : "/sign-in")} />
      )}
      <Waitlist />
    </div>
  );
}

function CmoPitch({ onUnlock }: { onUnlock: () => void }) {
  const items = [
    { icon: Gauge, title: "CMO verdicts", body: "Grades your positioning, competition and go-to-market — the sharp read you just saw, on every move you make." },
    { icon: ScanSearch, title: "Examine", body: "Studies your site and brand DNA — voice, values, aesthetic — so everything it makes actually sounds like you." },
    { icon: Workflow, title: "Comrk — the execution desk", body: "Runs campaigns end to end: connects your channels, schedules, and publishes with your approval." },
    { icon: Crown, title: "Chief — the oversight room", body: "Your KPIs, the week's focus, and exactly what needs your decision." },
    { icon: Megaphone, title: "Ads", body: "Audits your ad spend, finds what's leaking money, and designs fresh creatives." },
    { icon: PenLine, title: "Content & scripts", body: "LinkedIn, Instagram, ads, hooks and reel scripts — drafted in your brand voice, ready to post." },
  ];
  return (
    <div className="glass flex flex-col rounded-2xl p-5">
      <div className="flex items-center gap-2 border-b border-stroke pb-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-molten/[0.14] text-molten"><Sparkles size={16} aria-hidden /></span>
        <span className="text-[14px] font-semibold text-ink">Your mrk18 CMO</span>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        This isn&apos;t a writer — it&apos;s a Chief Marketing Officer that reads your business, plans, creates and{" "}
        <span className="font-semibold text-ink">executes</span>. Here&apos;s everything it does for you:
      </p>
      <div className="mt-4 space-y-3">
        {items.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex gap-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-stroke bg-surface text-molten"><Icon size={15} aria-hidden /></span>
            <div>
              <p className="text-[13px] font-semibold text-ink">{title}</p>
              <p className="text-[12px] leading-snug text-muted">{body}</p>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={onUnlock}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[14px] font-bold text-[color:var(--cta-ink,#fff)] transition-transform hover:scale-[1.02]"
        style={{ background: "var(--gradient-brand)" }}
      >
        <Lock size={15} aria-hidden /> Unlock the CMO →
      </button>
      <p className="mt-2 text-center text-[11px] text-mute-2">Free to start · no card required</p>
    </div>
  );
}

function GatedChat({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-4">
      <div className="pointer-events-auto mx-auto w-full max-w-[720px]">
        <div
          onClick={onOpen}
          className="taster-composer glass flex cursor-pointer items-center gap-2 rounded-2xl p-1.5 pl-4 shadow-[0_10px_40px_var(--shadow-color)]"
        >
          <input
            readOnly
            onFocus={onOpen}
            placeholder="Ask your CMO…"
            className="min-w-0 flex-1 cursor-pointer bg-transparent text-[14px] text-ink placeholder:text-mute-2 focus:outline-none"
            aria-label="Ask your CMO"
          />
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[color:var(--cta-ink,#fff)]" style={{ background: "var(--gradient-brand)" }}>
            <ArrowUp size={17} aria-hidden />
          </span>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-mute-2">Sign in for free chat with your CMO →</p>
      </div>
    </div>
  );
}
