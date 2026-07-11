"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Navbar from "@/components/Navbar";
import Waitlist from "@/components/sections/Waitlist";

/** The taster explore page (/taster/[domain]) — the hero hands the URL here and
 *  this page runs the analysis with a live step tracker, then lays the result
 *  out on ONE desktop screen (no page scroll): business + CMO's-read dial and
 *  competitors on the left, the four verdict cards center, insights + the
 *  locked next-moves gate right. Columns scroll internally on short viewports;
 *  mobile falls back to a normal single-column scroll.
 *
 *  The browser calls the FastAPI backend directly (NEXT_PUBLIC_BACKEND_URL,
 *  CORS-allowed) — no secrets here; the backend holds the Groq/Tavily keys. */

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000";

type Rival = { name: string; lane: string };
type VerdictCard = {
  verdict: string;
  points?: string[];
  score?: number | null;
  traits?: string[];
  rivals?: Rival[];
};
type TasterResults = {
  usp: VerdictCard;
  differentiation: VerdictCard;
  brand_analysis: VerdictCard;
  personality: VerdictCard;
};
type TasterResponse = {
  v?: number;
  domain: string;
  company?: string;
  offer?: string;
  results: TasterResults;
  key_insights?: string[];
  quick_wins?: string[];
  positioning?: string;
  competitors?: string[];
  cached?: boolean;
  sample?: boolean;
};

// Step tracker thresholds (seconds elapsed) — mapped to what the pipeline is
// genuinely doing server-side; the last step holds until the response lands.
const STEPS: { label: string; at: number }[] = [
  { label: "Reading the site", at: 0 },
  { label: "Identifying the business", at: 3 },
  { label: "Discovering real competitors", at: 6 },
  { label: "Studying their positioning", at: 10 },
  { label: "Writing four honest verdicts", at: 14 },
];

const CARDS: { key: keyof TasterResults; title: string; hint: string }[] = [
  { key: "usp", title: "USP", hint: "the one thing you actually own" },
  { key: "differentiation", title: "Competition", hint: "your edge vs. who you're up against" },
  { key: "brand_analysis", title: "Brand analysis", hint: "what your site really says" },
  { key: "personality", title: "Personality", hint: "how you sound to a stranger" },
];

const LOCKED_MOVES = [
  "Where your budget is leaking, in numbers",
  "This week's channel move, ready to approve",
  "The content calendar your CMO would run",
];

const openWaitlist = () => window.dispatchEvent(new Event("mrk18:open-waitlist"));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Favicon({ domain, size = 32 }: { domain: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external favicon service, not an optimizable asset
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
      alt=""
      width={size}
      height={size}
      className="rounded-lg border border-stroke bg-surface"
    />
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
      <path d="M4 12.5l5 5L20 6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Per-card grade: thin gradient bar + number. Only renders when the model
 *  actually graded (adapter mode returns none). */
function Score({ value }: { value?: number | null }) {
  if (typeof value !== "number") return null;
  return (
    <div className="flex shrink-0 items-center gap-1.5" aria-label={`graded ${value} out of 100`}>
      <div className="h-1 w-11 overflow-hidden rounded-full bg-[#1b1815]/10">
        <div
          className="h-full rounded-full"
          style={{ width: `${value}%`, background: "var(--gradient-brand)" }}
        />
      </div>
      <span className="text-[12px] font-extrabold tabular-nums text-ink">{value}</span>
    </div>
  );
}

/** The overall dial — average of the four card grades. */
function Dial({ value }: { value: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 72 72" width="58" height="58" role="img" aria-label={`overall ${value} out of 100`}>
      <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(27,24,21,0.1)" strokeWidth="6" />
      <circle
        cx="36"
        cy="36"
        r={r}
        fill="none"
        stroke="var(--amber)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${(value / 100) * c} ${c}`}
        transform="rotate(-90 36 36)"
      />
      <text x="36" y="43" textAnchor="middle" fontSize="19" fontWeight="800" fill="var(--ink)">
        {value}
      </text>
    </svg>
  );
}

export default function TasterExplore({ domain }: { domain: string }) {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<"loading" | "error" | "done">("loading");
  const [data, setData] = useState<TasterResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [warming, setWarming] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // elapsed ticker drives the step tracker
  useEffect(() => {
    if (phase !== "loading") return;
    const t = setInterval(() => setElapsed((e) => e + 0.5), 500);
    return () => clearInterval(t);
  }, [phase]);

  // The effect owns its fetch: cleanup cancels the stale run, the re-run fetches
  // again (dev StrictMode double-invokes this; the backend's domain cache makes
  // the repeat free). A ref guard here would deadlock: the guarded first run
  // gets cancelled by StrictMode's unmount and no run is left to deliver.
  useEffect(() => {
    let alive = true;

    (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        let res: Response;
        try {
          res = await fetch(`${BACKEND}/taster`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: domain }),
          });
        } catch {
          if (!alive) return;
          setError("We couldn't reach the analysis engine — try again in a minute.");
          setPhase("error");
          return;
        }
        if (!alive) return;

        if (res.status === 503 && attempt < 2) {
          setWarming(true);
          await sleep(25_000);
          if (!alive) return;
          continue;
        }

        const body = await res.json().catch(() => null);
        if (res.ok && body?.results) {
          setData(body as TasterResponse);
          setPhase("done");
        } else {
          setError(
            typeof body?.detail === "string"
              ? body.detail
              : "Something broke on our side — try again in a minute.",
          );
          setPhase("error");
        }
        return;
      }
    })();

    return () => {
      alive = false;
    };
  }, [domain]);

  const currentStep = STEPS.filter((s) => elapsed >= s.at).length - 1;

  // overall = average of the four card grades (absent in adapter mode)
  const scores = data
    ? CARDS.map((c) => data.results[c.key]?.score).filter((s): s is number => typeof s === "number")
    : [];
  const overall = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;

  return (
    <div className="theme-sand min-h-screen lg:h-screen lg:overflow-hidden">
      {/* same bone/greige backdrop + hairline grid as the landing */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-30 bg-[linear-gradient(105deg,#d3ccbb_0%,#dcd6c6_50%,#e5dfd1_100%)]"
      />
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-20">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
      </div>

      <Navbar subpage />

      <main className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-5 pb-4 pt-24">
        {phase === "loading" && (
          <div className="grid flex-1 place-items-center">
            <div className="glass w-full max-w-md rounded-2xl p-7">
              <div className="flex items-center gap-3.5">
                <Favicon domain={domain} size={38} />
                <div>
                  <h1
                    className="text-[20px] font-bold leading-tight text-ink"
                    style={{ fontFamily: "var(--font-claude-serif), Georgia, serif" }}
                  >
                    Reading {domain} cold
                  </h1>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    your CMO&apos;s first verdict · free · ~60 seconds
                  </p>
                </div>
              </div>

              <ol className="mt-6 space-y-3">
                {STEPS.map((step, i) => {
                  const state = i < currentStep ? "done" : i === currentStep ? "now" : "todo";
                  return (
                    <li key={step.label} className="flex items-center gap-3">
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[color:var(--cta-ink,#fff)] ${
                          state === "todo" ? "border border-stroke" : ""
                        } ${state === "now" && !reduceMotion ? "animate-pulse" : ""}`}
                        style={
                          state === "todo" ? undefined : { background: "var(--gradient-brand)" }
                        }
                      >
                        {state === "done" && <CheckIcon />}
                      </span>
                      <span
                        className={`text-[13.5px] ${
                          state === "todo" ? "text-muted" : "font-semibold text-ink"
                        }`}
                      >
                        {step.label}
                        {state === "now" ? "…" : ""}
                      </span>
                    </li>
                  );
                })}
              </ol>

              <AnimatePresence>
                {warming && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="mt-5 text-[12.5px] font-medium text-oxblood"
                  >
                    Waking the engine — a first run can take an extra ~30 seconds…
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="grid flex-1 place-items-center">
            <div className="glass w-full max-w-md rounded-2xl p-8 text-center">
              <h1 className="text-[19px] font-bold text-ink">Couldn&apos;t finish the read</h1>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">{error}</p>
              <Link
                href="/"
                className="mt-6 inline-block rounded-2xl px-6 py-3 text-[13.5px] font-semibold text-[color:var(--cta-ink,#0a0a0b)]"
                style={{ background: "var(--gradient-brand)" }}
              >
                Try another URL
              </Link>
            </div>
          </div>
        )}

        {phase === "done" && data && (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[248px_minmax(0,1fr)_264px]">
            {/* ── left rail: the business + the dial + competitors ────── */}
            <motion.aside
              initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto"
            >
              <div className="glass rounded-2xl p-4">
                <div className="flex items-center gap-2.5">
                  <Favicon domain={data.domain} />
                  <div className="min-w-0">
                    <h1
                      className="truncate text-[16px] font-bold leading-tight text-ink"
                      style={{ fontFamily: "var(--font-claude-serif), Georgia, serif" }}
                    >
                      {data.company || data.domain}
                    </h1>
                    <a
                      href={`https://${data.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11.5px] font-medium text-muted hover:text-ink"
                    >
                      {data.domain} ↗
                    </a>
                  </div>
                </div>
                {data.offer && (
                  <p className="mt-2.5 line-clamp-3 text-[12px] leading-relaxed text-ink/85">
                    {data.offer}
                  </p>
                )}
                {(data.cached || data.sample) && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {data.cached && (
                      <span className="rounded-full border border-stroke px-2 py-0.5 text-[10px] font-semibold text-muted">
                        analyzed in the last 24h
                      </span>
                    )}
                    {data.sample && (
                      <span className="rounded-full border border-stroke px-2 py-0.5 text-[10px] font-semibold text-oxblood">
                        SAMPLE OUTPUT
                      </span>
                    )}
                  </div>
                )}
              </div>

              {overall !== null && (
                <div className="glass flex items-center gap-3 rounded-2xl p-4">
                  <Dial value={overall} />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                      The CMO&apos;s read
                    </p>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
                      his grade out of 100 —<br />a judgment, not a metric
                    </p>
                  </div>
                </div>
              )}

              {data.positioning && (
                <div className="glass rounded-2xl p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                    How I&apos;d say it
                  </p>
                  <p
                    className="mt-2 text-[14px] font-semibold leading-snug text-ink"
                    style={{ fontFamily: "var(--font-claude-serif), Georgia, serif" }}
                  >
                    “{data.positioning}”
                  </p>
                  <p className="mt-1.5 text-[10.5px] text-muted">
                    the homepage headline your CMO would run
                  </p>
                </div>
              )}

              {(data.competitors?.length ?? 0) > 0 && (
                <div className="glass rounded-2xl p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Competitors discovered
                  </p>
                  <ul className="mt-2.5 space-y-2">
                    {data.competitors!.map((c) => (
                      <li key={c} className="flex items-center gap-2">
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-[color:var(--cta-ink,#fff)]"
                          style={{ background: "var(--gradient-brand)" }}
                        >
                          {c.charAt(0).toUpperCase()}
                        </span>
                        <span className="text-[12.5px] font-semibold text-ink">{c}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2.5 text-[10.5px] leading-relaxed text-muted">
                    found via live web search — not typed in by anyone
                  </p>
                </div>
              )}

              <Link
                href="/"
                className="px-1 text-[11.5px] font-semibold text-muted transition-colors hover:text-ink"
              >
                ← analyze another site
              </Link>
            </motion.aside>

            {/* ── center: the four verdicts, 2×2 ──────────────────────── */}
            <div className="flex min-h-0 flex-col">
              <h2 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
                The taster verdict — {data.domain}
              </h2>
              <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2 md:grid-rows-2">
                {CARDS.map((card, i) => {
                  const v = data.results[card.key];
                  return (
                    <motion.article
                      key={card.key}
                      initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: reduceMotion ? 0 : i * 0.1, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                      className="glass min-h-0 overflow-y-auto rounded-2xl p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-[13.5px] font-bold text-ink">{card.title}</h3>
                          <p className="text-[10px] font-medium text-muted">{card.hint}</p>
                        </div>
                        <Score value={v?.score} />
                      </div>

                      {/* the headline read — one blunt sentence */}
                      <p
                        className="mt-2.5 text-[14.5px] font-semibold leading-snug text-ink"
                        style={{ fontFamily: "var(--font-claude-serif), Georgia, serif" }}
                      >
                        {v?.verdict}
                      </p>

                      {/* competition: rival lanes */}
                      {card.key === "differentiation" && (v?.rivals?.length ?? 0) > 0 && (
                        <ul className="mt-2.5 space-y-1.5 border-t border-stroke pt-2.5">
                          {v!.rivals!.map((r) => (
                            <li key={r.name} className="flex items-center gap-2">
                              <span
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-[color:var(--cta-ink,#fff)]"
                                style={{ background: "var(--gradient-brand)" }}
                              >
                                {r.name.charAt(0).toUpperCase()}
                              </span>
                              <span className="shrink-0 text-[12px] font-bold text-ink">{r.name}</span>
                              <span className="truncate text-[11px] text-muted">{r.lane}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* evidence bullets */}
                      {(v?.points?.length ?? 0) > 0 && (
                        <ul className="mt-2.5 space-y-1.5">
                          {v!.points!.map((p) => (
                            <li key={p} className="flex gap-2 text-[12px] leading-relaxed text-ink/85">
                              <span
                                className="mt-[7px] h-1 w-2.5 shrink-0 rounded-full"
                                style={{ background: "var(--gradient-brand)" }}
                              />
                              {p}
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* personality: voice chips */}
                      {card.key === "personality" && (v?.traits?.length ?? 0) > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {v!.traits!.map((t) => (
                            <span
                              key={t}
                              className="rounded-full border border-stroke px-2 py-0.5 text-[10.5px] font-semibold text-ink/80"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </motion.article>
                  );
                })}
              </div>
            </div>

            {/* ── right rail: insights + the gate ─────────────────────── */}
            <motion.aside
              initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduceMotion ? 0 : 0.2, duration: 0.45 }}
              className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto"
            >
              {(data.key_insights?.length ?? 0) > 0 && (
                <div className="glass rounded-2xl p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Key insights
                  </p>
                  <ul className="mt-2.5 space-y-2.5">
                    {data.key_insights!.map((ins) => (
                      <li key={ins} className="flex gap-2">
                        <span
                          className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: "var(--gradient-brand)" }}
                        />
                        <span className="text-[12.5px] font-medium leading-snug text-ink">
                          {ins}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(data.quick_wins?.length ?? 0) > 0 && (
                <div className="glass rounded-2xl p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Quick wins this week
                  </p>
                  <ol className="mt-2.5 space-y-2">
                    {data.quick_wins!.map((w, i) => (
                      <li key={w} className="flex gap-2">
                        <span
                          className="flex h-4.5 w-4.5 mt-[1px] shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-[color:var(--cta-ink,#fff)]"
                          style={{ background: "var(--gradient-brand)" }}
                        >
                          {i + 1}
                        </span>
                        <span className="text-[12.5px] font-medium leading-snug text-ink">{w}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="glass rounded-2xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                  What the full CMO does next
                </p>
                <ul className="mt-2.5 space-y-2">
                  {LOCKED_MOVES.map((m) => (
                    <li key={m} className="flex items-center gap-2 text-muted">
                      <span className="shrink-0 text-oxblood">
                        <LockIcon />
                      </span>
                      <span className="text-[11.5px] font-medium blur-[1.5px] select-none">{m}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[11.5px] leading-relaxed text-ink/85">
                  This page is the taster — roughly 10% of the brain. The full CMO reads your
                  real numbers, flags what&apos;s leaking money, and executes with your approval.
                </p>
                <button
                  onClick={openWaitlist}
                  className="mt-3.5 w-full rounded-xl px-5 py-2.5 text-[13px] font-semibold text-[color:var(--cta-ink,#0a0a0b)] shadow-[0_10px_36px_var(--cta-glow,rgba(255,106,0,0.35))] transition-shadow duration-300 hover:shadow-[0_14px_48px_var(--cta-glow-strong,rgba(255,106,0,0.5))]"
                  style={{ background: "var(--gradient-brand)" }}
                >
                  Unlock the full CMO →
                </button>
                <p className="mt-2 text-center text-[10.5px] text-muted">
                  Pro — ₹3,499/mo (~$40) · Founding-500 pricing locked for life
                </p>
              </div>
            </motion.aside>
          </div>
        )}
      </main>

      {/* the Founding-500 application modal — opened by the gate CTA */}
      <Waitlist />
    </div>
  );
}
