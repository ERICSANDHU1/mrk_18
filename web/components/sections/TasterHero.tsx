"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

/** The free taster hero — Okara-style centered layout in the mrk18 register:
 *  eyebrow, serif headline, one-line sub, then ONE centered action. Two modes:
 *    · Website URL  → /taster/[domain] (the explore page runs the analysis)
 *    · Just an idea → 3 fields, handed to /taster/idea via sessionStorage
 *      (an unlaunched idea never belongs in a URL or browser history).
 *  Below: live "recently analyzed" chips from the backend's public cache —
 *  URL analyses only; ideas are private and never surface. */

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000";

const TAGLINE = "Drop your URL. Meet your CMO.";
const TAGLINE_LINES = ["Drop your URL.", "Meet your CMO."];

const EXAMPLES = ["allbirds.com", "linear.app"];

type RecentItem = { domain: string; company: string };
type Mode = "url" | "idea";

const FIELD =
  "w-full rounded-2xl border border-stroke bg-surface-2 px-5 py-3.5 text-[15px] text-ink placeholder:text-muted focus:border-molten/50 focus:outline-none disabled:opacity-60";

export default function TasterHero() {
  const router = useRouter();
  const { scrollY } = useScroll();
  const watermarkY = useTransform(scrollY, [0, 900], [0, 140]);
  const reduceMotion = useReducedMotion();

  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [idea, setIdea] = useState({ name: "", what: "", problem: "" });
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

  function goUrl(target: string) {
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

  function goIdea() {
    const name = idea.name.trim();
    const what = idea.what.trim();
    const problem = idea.problem.trim();
    if (!name || !what || !problem) {
      setErr("fill all three — the name, what you're building, and the problem");
      return;
    }
    setErr(null);
    setNavigating(true);
    // sessionStorage, not the URL: an unlaunched idea shouldn't live in
    // browser history, server logs, or a shareable link.
    try {
      sessionStorage.setItem("mrk18-taster-idea", JSON.stringify({ name, what, problem }));
    } catch {
      setErr("your browser blocked storage — allow it and try again");
      setNavigating(false);
      return;
    }
    router.push("/taster/idea");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (navigating) return;
    if (mode === "url") {
      if (url.trim()) goUrl(url);
    } else {
      goIdea();
    }
  }

  // examples fill the slots until real analyses exist; real ones take over
  const chips: RecentItem[] =
    recent.length >= 2
      ? recent
      : [...recent, ...EXAMPLES.map((d) => ({ domain: d, company: d })).slice(recent.length)];

  const segBtn = (active: boolean) =>
    `rounded-full px-5 py-2 text-[13px] font-semibold transition-colors ${
      active ? "text-[color:var(--cta-ink,#0a0a0b)]" : "text-muted hover:text-ink"
    }`;

  return (
    <section id="top" className="relative flex min-h-screen flex-col justify-center overflow-hidden px-6 pb-14 pt-36">
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

      {/* centered column — the Okara-style single action stack */}
      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center text-center">
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
        <h1 className="mt-7 text-[clamp(2.7rem,7.5vw,5.6rem)] font-extrabold leading-[1.02] tracking-[-0.03em]">
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
                          {/* nbsp escape: a plain space collapses to zero width inside these
                              overflow-hidden letter cells (renders as DropyourURL). Keep the
                              WRITTEN escape - a literal nbsp is invisible and already regressed once. */}
                          {char === " " ? "\u00A0" : char}
                        </motion.span>
                      </span>
                    ))}
                  </span>
                );
              })}
            </span>
          )}
        </h1>

        {/* one-line sub */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.75, duration: 0.7 }}
          className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted"
        >
          Your CMO reads it cold — finds your real competitors and hands you four honest
          verdicts. No numbers invented, ever.
        </motion.p>

        {/* mode toggle — website vs idea */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.85, duration: 0.6 }}
          className="glass mt-8 inline-flex rounded-full p-1"
          role="tablist"
          aria-label="What are you analyzing?"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "url"}
            onClick={() => {
              setMode("url");
              setErr(null);
            }}
            className={segBtn(mode === "url")}
            style={mode === "url" ? { background: "var(--gradient-brand)" } : undefined}
          >
            I have a website
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "idea"}
            onClick={() => {
              setMode("idea");
              setErr(null);
            }}
            className={segBtn(mode === "idea")}
            style={mode === "idea" ? { background: "var(--gradient-brand)" } : undefined}
          >
            I only have an idea
          </button>
        </motion.div>

        {/* the action — centered input(s) */}
        <motion.form
          onSubmit={onSubmit}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.95, duration: 0.7 }}
          className="mt-5 w-full max-w-xl"
        >
          {mode === "url" ? (
            <div className="flex flex-col gap-3 sm:flex-row">
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
                className={`${FIELD} flex-1 py-4`}
              />
              <button
                type="submit"
                disabled={navigating || !url.trim()}
                className="rounded-2xl px-7 py-4 text-[15px] font-semibold text-[color:var(--cta-ink,#0a0a0b)] shadow-[0_12px_44px_var(--cta-glow,rgba(255,106,0,0.35))] transition-shadow duration-300 hover:shadow-[0_16px_56px_var(--cta-glow-strong,rgba(255,106,0,0.5))] disabled:cursor-not-allowed disabled:opacity-60"
                style={{ background: "var(--gradient-brand)" }}
              >
                {navigating ? "Opening…" : "Analyze free"}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 text-left">
              <label htmlFor="idea-name" className="sr-only">
                Startup or idea name
              </label>
              <input
                id="idea-name"
                type="text"
                maxLength={80}
                placeholder="Startup / idea name"
                value={idea.name}
                onChange={(e) => setIdea({ ...idea, name: e.target.value })}
                disabled={navigating}
                className={FIELD}
              />
              <label htmlFor="idea-what" className="sr-only">
                What are you building?
              </label>
              <input
                id="idea-what"
                type="text"
                maxLength={300}
                placeholder="What are you building? (one line)"
                value={idea.what}
                onChange={(e) => setIdea({ ...idea, what: e.target.value })}
                disabled={navigating}
                className={FIELD}
              />
              <label htmlFor="idea-problem" className="sr-only">
                What problem does it solve, and for whom?
              </label>
              <textarea
                id="idea-problem"
                rows={3}
                maxLength={2000}
                placeholder="What problem does it solve, and for whom?"
                value={idea.problem}
                onChange={(e) => setIdea({ ...idea, problem: e.target.value })}
                disabled={navigating}
                className={`${FIELD} resize-none`}
              />
              <button
                type="submit"
                disabled={navigating}
                className="rounded-2xl px-7 py-4 text-[15px] font-semibold text-[color:var(--cta-ink,#0a0a0b)] shadow-[0_12px_44px_var(--cta-glow,rgba(255,106,0,0.35))] transition-shadow duration-300 hover:shadow-[0_16px_56px_var(--cta-glow-strong,rgba(255,106,0,0.5))] disabled:cursor-not-allowed disabled:opacity-60"
                style={{ background: "var(--gradient-brand)" }}
              >
                {navigating ? "Opening…" : "Analyze my idea — free"}
              </button>
            </div>
          )}
        </motion.form>

        {/* microcopy + error */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 3.05, duration: 0.6 }}
          className="mt-3 text-[12.5px] text-muted"
        >
          Free · no sign-up · no card required
        </motion.p>
        <div aria-live="polite" className="mt-2 min-h-[1.25rem]">
          {err && <p className="text-[13.5px] font-medium text-oxblood">{err}</p>}
        </div>

        {/* recently analyzed (live from the public cache) + examples */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 3.15, duration: 0.7 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-2.5"
        >
          <span className="text-[12px] font-semibold uppercase tracking-[0.18em] text-muted">
            {recent.length >= 2 ? "Recently analyzed" : "Try an example"}
          </span>
          {chips.map((c) => (
            <button
              key={c.domain}
              onClick={() => goUrl(c.domain)}
              className="glass flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-ink transition-colors hover:border-amber/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- external favicon service */}
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
      </div>
    </section>
  );
}
