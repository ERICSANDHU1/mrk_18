"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useAuth, useUser } from "@clerk/nextjs";
import Navbar from "@/components/Navbar";
import Waitlist from "@/components/sections/Waitlist";
import FoundingToast from "@/components/taster/FoundingToast";
import AdAudit from "@/components/taster/AdAudit";

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
  motion?: string; // gtm card: the recommended go-to-market motion (badge)
  primary_channel?: string; // gtm card: the one channel + named entry point
};
type TasterResults = {
  usp: VerdictCard;
  differentiation: VerdictCard;
  gtm: VerdictCard;
};
type TasterResponse = {
  v?: number;
  domain: string;
  mode?: string; // "idea" when analyzing a described idea instead of a live site
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
const STEPS_URL: { label: string; at: number }[] = [
  { label: "Reading the site", at: 0 },
  { label: "Identifying the business", at: 3 },
  { label: "Discovering real competitors", at: 6 },
  { label: "Studying their positioning", at: 10 },
  { label: "Writing four honest verdicts", at: 14 },
];
// idea mode skips the site read + identity steps server-side too
const STEPS_IDEA: { label: string; at: number }[] = [
  { label: "Reading your idea", at: 0 },
  { label: "Discovering real competitors", at: 3 },
  { label: "Studying their positioning", at: 8 },
  { label: "Writing four honest verdicts", at: 12 },
];

const CARDS: { key: keyof TasterResults; title: string; hint: string }[] = [
  { key: "usp", title: "USP", hint: "the one thing you actually own" },
  { key: "differentiation", title: "Competition", hint: "your edge vs. who you're up against" },
  { key: "gtm", title: "GTM Strategy", hint: "how you actually reach your first customers" },
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

/** Idea mode has no favicon — a lightbulb in the same framed-tile style. */
function IdeaGlyph({ size = 32 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-lg border border-stroke bg-surface text-molten"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 3.6 10.8c-.6.5-.9 1.2-.9 1.9V16h-5.4v-.3c0-.7-.3-1.4-.9-1.9A6 6 0 0 1 12 3z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
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
      <div className="h-1 w-11 overflow-hidden rounded-full bg-[var(--track)]">
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

export default function TasterExplore({
  domain,
  mode = "url",
}: {
  domain?: string;
  mode?: "url" | "idea";
}) {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser(); // toast (Ask 1) shows only to signed-out visitors
  const { getToken } = useAuth(); // signed-in → send the session token so the backend skips the free cap
  const [phase, setPhase] = useState<"loading" | "error" | "done">("loading");
  const [data, setData] = useState<TasterResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [warming, setWarming] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [ideaName, setIdeaName] = useState(""); // for the loading headline
  const isIdea = mode === "idea";

  /** Go back to wherever they actually came from — the hero with their typed
   *  URL still in it, a previous analysis, wherever. Only a deep/shared link
   *  (no in-app history) falls back to the landing page. */
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  };

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
      // Idea mode: the hero handed the idea over via sessionStorage (an
      // unlaunched idea never belongs in a URL). Missing = deep-linked or
      // storage cleared — send them back to the hero, don't 422 the backend.
      let payload: Record<string, string>;
      if (mode === "idea") {
        let stored: { name?: string; what?: string; problem?: string } | null = null;
        try {
          stored = JSON.parse(sessionStorage.getItem("mrk18-taster-idea") || "null");
        } catch {
          stored = null;
        }
        if (!stored?.name || !stored?.what || !stored?.problem) {
          setError("We lost your idea on the way here — go back and enter it again.");
          setPhase("error");
          return;
        }
        setIdeaName(stored.name);
        payload = { mode: "idea", name: stored.name, what: stored.what, problem: stored.problem };
      } else {
        payload = { url: domain ?? "" };
      }

      // attach the Clerk session token when signed in — the backend then exempts
      // this caller from the anonymous free cap (getToken → null when logged out)
      const token = await getToken().catch(() => null);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      for (let attempt = 0; attempt < 3; attempt++) {
        let res: Response;
        try {
          res = await fetch(`${BACKEND}/taster`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
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
    // getToken is stable from Clerk; listed to satisfy the exhaustive-deps rule
  }, [domain, mode, getToken]);

  const STEPS = isIdea ? STEPS_IDEA : STEPS_URL;
  const currentStep = STEPS.filter((s) => elapsed >= s.at).length - 1;

  // overall = average of the four card grades (absent in adapter mode)
  const scores = data
    ? CARDS.map((c) => data.results[c.key]?.score).filter((s): s is number => typeof s === "number")
    : [];
  const overall = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;

  return (
    <div className="theme-sand taster-scope min-h-screen lg:h-screen lg:overflow-hidden">
      {/* same bone/greige backdrop + hairline grid as the landing */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-30 bg-[image:var(--taster-bg)]"
      />
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-20">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--taster-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--taster-grid)_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
      </div>

      {/* appearance switcher lives in the pill: present in every phase, and
          never floating over the verdict panels */}
      <Navbar subpage appearance />

      <main className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-5 pb-4 pt-24">
        {phase === "loading" && (
          <div className="grid flex-1 place-items-center">
            <div className="glass w-full max-w-md rounded-2xl p-7">
              <div className="flex items-center gap-3.5">
                {isIdea ? <IdeaGlyph size={38} /> : <Favicon domain={domain ?? ""} size={38} />}
                <div>
                  <h1
                    className="text-[20px] font-bold leading-tight text-ink"
                    style={{ fontFamily: "var(--font-claude-serif), Georgia, serif" }}
                  >
                    Reading {isIdea ? `“${ideaName || "your idea"}”` : domain} cold
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
                {isIdea ? "Back to the taster" : "Try another URL"}
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
              {/* real history back, at the TOP where a back control belongs.
                  A deep/shared link has no in-app history to return to, so it
                  falls back to the hero instead of stranding the visitor. */}
              <button
                onClick={goBack}
                className="self-start px-1 text-[11.5px] font-semibold text-muted transition-colors hover:text-ink"
              >
                ← analyze another site
              </button>

              <div className="glass rounded-2xl p-4">
                <div className="flex items-center gap-2.5">
                  {isIdea ? <IdeaGlyph /> : <Favicon domain={data.domain} />}
                  <div className="min-w-0">
                    <h1
                      className="truncate text-[16px] font-bold leading-tight text-ink"
                      style={{ fontFamily: "var(--font-claude-serif), Georgia, serif" }}
                    >
                      {data.company || data.domain}
                    </h1>
                    {isIdea ? (
                      <p className="text-[11.5px] font-medium text-muted">
                        idea · based on your description
                      </p>
                    ) : (
                      <a
                        href={`https://${data.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11.5px] font-medium text-muted hover:text-ink"
                      >
                        {data.domain} ↗
                      </a>
                    )}
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

            </motion.aside>

            {/* ── center: the four verdicts, 2×2 ──────────────────────── */}
            <div className="flex min-h-0 flex-col">
              <h2 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
                The taster verdict — {isIdea ? data.company || "your idea" : data.domain}
                {isIdea && (
                  <span className="ml-2 normal-case tracking-normal">
                    · based on your description
                  </span>
                )}
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

                      {/* gtm: motion badge + the one primary channel */}
                      {card.key === "gtm" && (v?.motion || v?.primary_channel) && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-stroke pt-2.5">
                          {v?.motion && (
                            <span
                              className="rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[color:var(--cta-ink,#fff)]"
                              style={{ background: "var(--gradient-brand)" }}
                            >
                              {v.motion}
                            </span>
                          )}
                          {v?.primary_channel && (
                            <span className="text-[11.5px] font-semibold text-ink">
                              → {v.primary_channel}
                            </span>
                          )}
                        </div>
                      )}

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

                    </motion.article>
                  );
                })}

                {/* 4th cell — the ad analyser. Three auto verdicts + this keeps
                    the 2x2 grid; the full forensic report opens on its own
                    canvas because it's a page, not a card. */}
                <motion.div
                  initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: reduceMotion ? 0 : CARDS.length * 0.1,
                    duration: 0.45,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="min-h-0"
                >
                  <AdAudit brandContext={data.company || data.domain} variant="card" />
                </motion.div>
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

      {/* Ask 1 — post-analysis toast (signed-out visitors only, once results land) */}
      {phase === "done" && isLoaded && !isSignedIn && <FoundingToast />}

      {/* the Founding-500 application modal — opened by the gate CTA */}
      <Waitlist />
    </div>
  );
}
