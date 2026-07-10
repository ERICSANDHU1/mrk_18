"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

/** The free taster hero — paste a URL and the analysis opens on its own page
 *  (/taster/[domain], see components/taster/TasterExplore.tsx). This hero only
 *  validates the shape of the input and navigates; the explore page runs the
 *  pipeline. Below the form: live "recently analyzed" chips from the backend's
 *  public cache (plus two always-good examples). */

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000";

const TAGLINE = "Drop your URL. Meet your CMO.";
const TAGLINE_LINES = ["Drop your URL.", "Meet your CMO."];

const EXAMPLES = ["allbirds.com", "linear.app"];

type RecentItem = { domain: string; company: string };

export default function TasterHero() {
  const router = useRouter();
  const { scrollY } = useScroll();
  const watermarkY = useTransform(scrollY, [0, 900], [0, 140]);
  const reduceMotion = useReducedMotion();

  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [recent, setRecent] = useState<RecentItem[]>([]);

  useEffect(() => {
    let alive = true;
    fetch(`${BACKEND}/taster/recent`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && Array.isArray(d?.items)) setRecent(d.items.slice(0, 4));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  function go(target: string) {
    const domain = target
      .trim()
      .replace(/^https?:\/\//i, "")
      .split("/")[0]
      .replace(/^www\./i, "");
    if (!domain || !domain.includes(".")) {
      setErr("that doesn't look like a website — try something like yourbusiness.com");
      return;
    }
    setErr(null);
    setNavigating(true);
    router.push(`/taster/${encodeURIComponent(domain)}`);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!navigating && url.trim()) go(url);
  }

  // examples fill the slots until real analyses exist; real ones take over
  const chips: RecentItem[] =
    recent.length >= 2
      ? recent
      : [...recent, ...EXAMPLES.map((d) => ({ domain: d, company: d })).slice(recent.length)];

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
                          {char === " " ? " " : char}
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
          Paste your website. Your CMO reads it cold — finds your real competitors, and hands
          you four honest verdicts: USP, competition, brand, voice. No numbers invented, ever.
        </motion.p>

        {/* URL form → /taster/[domain] */}
        <motion.form
          onSubmit={onSubmit}
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
            disabled={navigating}
            className="w-full flex-1 rounded-2xl border border-stroke bg-surface-2 px-5 py-4 text-[15px] text-ink placeholder:text-muted focus:border-molten/50 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={navigating || !url.trim()}
            className="rounded-2xl px-7 py-4 text-[15px] font-semibold text-[color:var(--cta-ink,#0a0a0b)] shadow-[0_12px_44px_var(--cta-glow,rgba(255,106,0,0.35))] transition-shadow duration-300 hover:shadow-[0_16px_56px_var(--cta-glow-strong,rgba(255,106,0,0.5))] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ background: "var(--gradient-brand)" }}
          >
            {navigating ? "Opening…" : "Analyze free"}
          </button>
        </motion.form>

        <div aria-live="polite" className="mt-4 min-h-[1.25rem] max-w-xl">
          {err && <p className="text-[13.5px] font-medium text-oxblood">{err}</p>}
        </div>

        {/* recently analyzed (live from the public cache) + examples */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 3.05, duration: 0.7 }}
          className="mt-8 flex flex-wrap items-center gap-2.5"
        >
          <span className="text-[12px] font-semibold uppercase tracking-[0.18em] text-muted">
            {recent.length >= 2 ? "Recently analyzed" : "Try an example"}
          </span>
          {chips.map((c) => (
            <button
              key={c.domain}
              onClick={() => go(c.domain)}
              className="glass flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-ink transition-colors hover:border-amber/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(c.domain)}&sz=32`}
                alt=""
                width={14}
                height={14}
                className="rounded-sm"
              />
              {c.company}
            </button>
          ))}
        </motion.div>

        {/* reassurance chips */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 3.2, duration: 0.7 }}
          className="mt-12 flex flex-wrap gap-x-8 gap-y-3 text-[13px] font-medium text-muted"
        >
          <span>4 verdicts + real competitors</span>
          <span>·</span>
          <span>~60 seconds</span>
          <span>·</span>
          <span>no sign-up, no card</span>
          <span>·</span>
          <span>zero invented numbers</span>
        </motion.div>
      </div>
    </section>
  );
}
