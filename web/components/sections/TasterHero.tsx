"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

/** The free taster hero — paste a URL, the CMO reads the site and hands back
 *  four verdicts (USP · Differentiation · Brand analysis · Personality), served
 *  by 4 LoRA adapters on the dedicated taster endpoint via the public backend
 *  POST /taster. No sign-up; the gate below the results is the conversion path
 *  (opens the existing Founding-500 waitlist modal).
 *
 *  The browser calls the FastAPI backend directly (NEXT_PUBLIC_BACKEND_URL,
 *  CORS-allowed) instead of proxying through a Next serverless function — a
 *  RunPod cold start can take ~30-40s, longer than serverless timeouts. Only
 *  the backend holds the RunPod/Tavily keys; nothing secret ships here. */

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000";

const TAGLINE = "Drop your URL. Meet your CMO.";
const TAGLINE_LINES = ["Drop your URL.", "Meet your CMO."];

// Staged loader masks the 10-40s wall clock — the stages map to what the
// pipeline is genuinely doing (Tavily read, then the four adapters).
const STAGES = [
  "Reading your site…",
  "Finding your USP…",
  "Measuring your edge…",
  "Reading the brand…",
  "Hearing your voice…",
];
const WARMING_MSG = "Waking the engine — a first run takes ~30 seconds…";

type TasterResults = {
  usp: string;
  differentiation: string;
  brand_analysis: string;
  personality: string;
};
type TasterResponse = {
  domain: string;
  results: TasterResults;
  cached?: boolean;
  sample?: boolean;
};

const CARDS: { key: keyof TasterResults; title: string; hint: string }[] = [
  { key: "usp", title: "USP", hint: "the one thing you actually own" },
  { key: "differentiation", title: "Differentiation", hint: "where you stand apart — or don't" },
  { key: "brand_analysis", title: "Brand analysis", hint: "what your site really says" },
  { key: "personality", title: "Personality", hint: "how you sound to a stranger" },
];

const openWaitlist = () => window.dispatchEvent(new Event("mrk18:open-waitlist"));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function TasterHero() {
  const { scrollY } = useScroll();
  const watermarkY = useTransform(scrollY, [0, 900], [0, 140]);
  const reduceMotion = useReducedMotion();

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [warming, setWarming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TasterResponse | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // advance the staged loader while waiting; hold on the last stage
  // (stage is reset to 0 in analyze(), where the wait actually starts)
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 5500);
    return () => clearInterval(t);
  }, [loading]);

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !url.trim()) return;
    setError(null);
    setData(null);
    setWarming(false);
    setStage(0);
    setLoading(true);

    // one request + up to two honest cold-start retries (backend answers 503
    // while the serverless worker boots)
    for (let attempt = 0; attempt < 3; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${BACKEND}/taster`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        });
      } catch {
        if (!alive.current) return;
        setError("We couldn't reach the analysis engine — try again in a minute.");
        setLoading(false);
        return;
      }
      if (!alive.current) return;

      if (res.status === 503 && attempt < 2) {
        setWarming(true);
        await sleep(25_000);
        if (!alive.current) return;
        continue;
      }

      const body = await res.json().catch(() => null);
      if (res.ok && body?.results) {
        setData(body as TasterResponse);
      } else {
        setError(
          typeof body?.detail === "string"
            ? body.detail
            : "Something broke on our side — try again in a minute.",
        );
      }
      setLoading(false);
      setWarming(false);
      return;
    }
  }

  return (
    <section id="top" className="relative flex min-h-screen flex-col justify-center overflow-hidden px-6 pb-14 pt-40">
      {/* grid backdrop — transparent so the page's taupe gradient shows through */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-20">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
      </div>

      {/* giant outlined watermark, scroll parallax */}
      <motion.div
        aria-hidden
        style={{ y: watermarkY }}
        className="text-outline pointer-events-none absolute -bottom-10 left-1/2 -translate-x-1/2 select-none text-[clamp(8rem,26vw,22rem)] font-extrabold leading-none tracking-tight"
      >
        mrk18
      </motion.div>

      {/* large two-tone "mrk18" brand mark on the right */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.6, duration: 1 }}
        style={{ fontFamily: "var(--font-claude-serif), Georgia, serif" }}
        className="pointer-events-none absolute right-[5%] top-20 z-0 hidden select-none text-[clamp(3rem,6.5vw,6.5rem)] font-bold leading-none tracking-[-0.005em] lg:block"
      >
        <span style={{ color: "rgba(27,24,21,0.88)" }}>mrk</span>
        <span style={{ color: "var(--oxblood)" }}>18</span>
      </motion.div>

      <div className="relative z-10 mx-auto w-full max-w-6xl">
        {/* eyebrow */}
        <motion.span
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.2, duration: 0.6 }}
          className="glass inline-flex items-center gap-2.5 rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted"
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--gradient-brand)" }} />
          FREE ANALYSIS · NO SIGN-UP
        </motion.span>

        {/* headline */}
        <h1 className="mt-8 text-[clamp(2.9rem,8.5vw,7rem)] font-extrabold leading-[0.98] tracking-[-0.03em]">
          {reduceMotion ? (
            <span>
              <span className="block text-ink">{TAGLINE_LINES[0]}</span>
              <span className="text-gradient block">{TAGLINE_LINES[1]}</span>
            </span>
          ) : (
            <span aria-label={TAGLINE}>
              {TAGLINE_LINES.map((line, lineIdx) => {
                const offset = TAGLINE_LINES.slice(0, lineIdx).reduce((n, l) => n + l.length, 0);
                return (
                  <span key={lineIdx} className="block">
                    {line.split("").map((char, i) => (
                      <span key={i} className="inline-block overflow-hidden align-bottom">
                        <motion.span
                          className={`${lineIdx === 0 ? "text-ink" : "text-gradient"} inline-block`}
                          initial={{ y: "112%" }}
                          animate={{ y: 0 }}
                          transition={{ delay: 2.3 + (offset + i) * 0.03, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        >
                          {char === " " ? " " : char}
                        </motion.span>
                      </span>
                    ))}
                  </span>
                );
              })}
            </span>
          )}
        </h1>

        {/* value prop */}
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.75, duration: 0.7 }}
          className="glass mt-8 max-w-xl rounded-2xl px-6 py-5 text-lg leading-relaxed text-ink"
        >
          Paste your website. Your CMO reads it cold and hands you four honest verdicts —
          your USP, your edge, your brand, your voice. No numbers invented, ever.
        </motion.p>

        {/* URL form */}
        <motion.form
          onSubmit={analyze}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.9, duration: 0.7 }}
          className="mt-10 flex w-full max-w-xl flex-col gap-3 sm:flex-row"
        >
          <label htmlFor="taster-url" className="sr-only">
            Your business website URL
          </label>
          <input
            id="taster-url"
            type="text"
            inputMode="url"
            autoComplete="url"
            placeholder="yourbusiness.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
            className="w-full flex-1 rounded-2xl border border-stroke bg-surface-2 px-5 py-4 text-[15px] text-ink placeholder:text-muted focus:border-molten/50 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="rounded-2xl px-7 py-4 text-[15px] font-semibold text-[color:var(--cta-ink,#0a0a0b)] shadow-[0_12px_44px_var(--cta-glow,rgba(255,106,0,0.35))] transition-shadow duration-300 hover:shadow-[0_16px_56px_var(--cta-glow-strong,rgba(255,106,0,0.5))] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ background: "var(--gradient-brand)" }}
          >
            {loading ? "Analyzing…" : "Analyze free"}
          </button>
        </motion.form>

        {/* staged loader / error */}
        <div aria-live="polite" className="mt-5 min-h-[1.5rem] max-w-xl">
          <AnimatePresence mode="wait">
            {loading && (
              <motion.p
                key={warming ? "warming" : `stage-${stage}`}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2.5 text-[14px] font-medium text-muted"
              >
                <span
                  className={`h-2 w-2 rounded-full ${reduceMotion ? "" : "animate-pulse"}`}
                  style={{ background: "var(--gradient-brand)" }}
                />
                {warming ? WARMING_MSG : STAGES[stage]}
              </motion.p>
            )}
            {error && !loading && (
              <motion.p
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-[14px] font-medium text-oxblood"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* results — 4 verdict cards + the gate */}
        {data && (
          <div className="mt-10">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.2em] text-muted">
                The taster verdict — {data.domain}
              </h2>
              {data.cached && (
                <span className="text-[11px] font-medium text-muted">
                  analyzed in the last 24h — served from memory
                </span>
              )}
              {data.sample && (
                <span className="rounded-full border border-stroke px-2 py-0.5 text-[11px] font-semibold text-oxblood">
                  SAMPLE OUTPUT
                </span>
              )}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {CARDS.map((card, i) => (
                <motion.article
                  key={card.key}
                  initial={{ opacity: 0, y: reduceMotion ? 0 : 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduceMotion ? 0 : i * 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="glass rounded-2xl p-6"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-[15px] font-bold text-ink">{card.title}</h3>
                    <span className="text-[11px] font-medium text-muted">{card.hint}</span>
                  </div>
                  <p className="mt-3 whitespace-pre-line text-[14.5px] leading-relaxed text-ink/90">
                    {data.results[card.key]}
                  </p>
                </motion.article>
              ))}
            </div>

            {/* the gate — visibly partial, deliberately */}
            <motion.div
              initial={{ opacity: 0, y: reduceMotion ? 0 : 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduceMotion ? 0 : 0.55, duration: 0.5 }}
              className="glass mt-6 flex flex-col items-start gap-4 rounded-2xl p-6 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-[15px] font-semibold text-ink">
                  This is the taster — roughly 10% of the brain.
                </p>
                <p className="mt-1 text-[13.5px] text-muted">
                  The full CMO reads your real numbers, flags what&apos;s leaking money, and
                  executes with your approval. Pro — ₹3,499/mo (~$40).
                </p>
              </div>
              <button
                onClick={openWaitlist}
                className="shrink-0 rounded-2xl px-6 py-3.5 text-[14px] font-semibold text-[color:var(--cta-ink,#0a0a0b)] shadow-[0_12px_44px_var(--cta-glow,rgba(255,106,0,0.35))] transition-shadow duration-300 hover:shadow-[0_16px_56px_var(--cta-glow-strong,rgba(255,106,0,0.5))]"
                style={{ background: "var(--gradient-brand)" }}
              >
                Unlock the full CMO →
              </button>
            </motion.div>
          </div>
        )}

        {/* reassurance chips (idle only — results take the space once they exist) */}
        {!data && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 3.05, duration: 0.7 }}
            className="mt-14 flex flex-wrap gap-x-8 gap-y-3 text-[13px] font-medium text-muted"
          >
            <span>4 verdicts, founder-plain</span>
            <span>·</span>
            <span>~60 seconds</span>
            <span>·</span>
            <span>no sign-up, no card</span>
            <span>·</span>
            <span>zero invented numbers</span>
          </motion.div>
        )}
      </div>
    </section>
  );
}
