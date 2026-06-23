"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  Flag,
  type LucideIcon,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";

export type Conf = "high" | "medium" | "low";
export type Claim = { text: string; source: string; confidence: Conf };
export type Section = { summary: string; claims: Claim[] };
export type Report = {
  market_intel: Section;
  audience_positioning: Section;
  content_strategy: Section;
  synthesis: string;
  founder_flags: string[];
};

const CONF: Record<Conf, { label: string; cls: string }> = {
  high: { label: "high", cls: "text-molten border-molten/30 bg-molten/10" },
  medium: { label: "medium", cls: "text-amber border-amber/30 bg-amber/10" },
  low: { label: "low", cls: "text-mute-2 border-line bg-surface-2" },
};

type Slide =
  | { kind: "verdict" }
  | { kind: "section"; n: number; title: string; icon: LucideIcon; section: Section }
  | { kind: "decision" };

type Decision = {
  submitting: boolean;
  flagging: boolean;
  flagText: string;
  setFlagText: (v: string) => void;
  onApprove: () => void;
  onStartFlag: () => void;
  onSubmitFlag: () => void;
  onCancelFlag: () => void;
};

export default function ReportStory({ report, ...decision }: { report: Report } & Decision) {
  const reduce = useReducedMotion();

  const slides: Slide[] = useMemo(
    () => [
      { kind: "verdict" },
      { kind: "section", n: 1, title: "Market Intelligence", icon: TrendingUp, section: report.market_intel },
      { kind: "section", n: 2, title: "Audience & Positioning", icon: Target, section: report.audience_positioning },
      { kind: "section", n: 3, title: "Content Strategy", icon: Sparkles, section: report.content_strategy },
      { kind: "decision" },
    ],
    [report],
  );

  const [[index, dir], setState] = useState<[number, number]>([0, 0]);
  const go = useCallback(
    (next: number, d: number) => setState([Math.max(0, Math.min(slides.length - 1, next)), d]),
    [slides.length],
  );
  const paginate = useCallback((d: number) => go(index + d, d), [go, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") paginate(1);
      else if (e.key === "ArrowLeft") paginate(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paginate]);

  const variants = {
    enter: (d: number) => ({ x: d >= 0 ? "100%" : "-100%", opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d >= 0 ? "-100%" : "100%", opacity: 0 }),
  };

  const slide = slides[index];
  const last = slides.length - 1;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-bg">
      {/* ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-1/3 left-1/2 h-[70vh] w-[70vh] -translate-x-1/2 rounded-full bg-molten/10 blur-[120px]"
      />

      {/* top bar: back · progress · counter */}
      <header className="relative z-10 flex items-center gap-4 px-5 pt-5 sm:px-8">
        <Link
          href="/cowork"
          className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-mute transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} aria-hidden /> Workspace
        </Link>
        <div className="flex flex-1 gap-1.5">
          {slides.map((_, i) => (
            <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-[rgba(27,24,21,0.08)]">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-molten to-ember"
                initial={false}
                animate={{ width: i <= index ? "100%" : "0%" }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>
          ))}
        </div>
        <span className="font-data shrink-0 text-[11px] text-mute-2">
          {index + 1}/{slides.length}
        </span>
      </header>

      {/* slides */}
      <div className="relative z-0 flex-1 overflow-hidden">
        <AnimatePresence custom={dir} initial={false}>
          <motion.div
            key={index}
            custom={dir}
            variants={reduce ? undefined : variants}
            initial={reduce ? { opacity: 0 } : "enter"}
            animate={reduce ? { opacity: 1 } : "center"}
            exit={reduce ? { opacity: 0 } : "exit"}
            transition={{ x: { type: "spring", stiffness: 260, damping: 30 }, opacity: { duration: 0.25 } }}
            drag={reduce ? false : "x"}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={(_, info) => {
              if (info.offset.x < -80) paginate(1);
              else if (info.offset.x > 80) paginate(-1);
            }}
            className="absolute inset-0"
          >
            {slide.kind === "verdict" && (
              <VerdictSlide synthesis={report.synthesis} flags={report.founder_flags} />
            )}
            {slide.kind === "section" && <SectionSlide slide={slide} />}
            {slide.kind === "decision" && <DecisionSlide {...decision} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* nav */}
      <footer className="relative z-10 flex items-center justify-between px-5 pb-5 sm:px-8">
        <button
          onClick={() => paginate(-1)}
          disabled={index === 0}
          aria-label="Previous"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-mute transition hover:bg-[var(--overlay-subtle)] disabled:opacity-30"
        >
          <ChevronLeft size={18} aria-hidden />
        </button>

        <div className="flex items-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i, i > index ? 1 : -1)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === index ? "w-6 bg-molten" : "w-2 bg-[rgba(27,24,21,0.16)] hover:bg-[rgba(27,24,21,0.28)]"
              }`}
            />
          ))}
        </div>

        {index === last ? (
          <div className="h-10 w-10" aria-hidden />
        ) : (
          <button
            onClick={() => paginate(1)}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-molten via-amber to-ember px-4 text-[13px] font-bold text-white transition hover:opacity-90"
          >
            {index === last - 1 ? "Decide" : "Next"} <ChevronRight size={16} aria-hidden />
          </button>
        )}
      </footer>
    </div>
  );
}

function VerdictSlide({ synthesis, flags }: { synthesis: string; flags: string[] }) {
  return (
    <div className="dash-scroll flex h-full w-full items-center justify-center overflow-y-auto px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mx-auto max-w-2xl text-center"
      >
        <p className="font-data inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-molten">
          <Brain size={13} aria-hidden /> MRK18 · Your CMO
        </p>
        <h1 className="font-display mt-5 text-[40px] leading-[1.04] sm:text-[56px]">The Verdict</h1>
        <p className="mt-6 whitespace-pre-line text-left text-[15px] leading-relaxed text-ink/90 sm:text-[17px]">
          {synthesis}
        </p>
        {flags?.length > 0 && (
          <p className="mt-6 text-[12px] text-mute-2">
            Re-worked around your {flags.length} flagged point{flags.length > 1 ? "s" : ""}.
          </p>
        )}
      </motion.div>
    </div>
  );
}

function SectionSlide({ slide }: { slide: Extract<Slide, { kind: "section" }> }) {
  const Icon = slide.icon;
  return (
    <div className="dash-scroll h-full w-full overflow-y-auto px-6 py-10 sm:px-12">
      <div className="mx-auto max-w-3xl">
        <motion.div
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35 }}
          className="flex items-center gap-4"
        >
          <span className="font-display text-[64px] leading-none text-molten/15 sm:text-[88px]">0{slide.n}</span>
          <div>
            <p className="font-data inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-mute-2">
              <Icon size={13} className="text-molten" aria-hidden /> Intelligence
            </p>
            <h2 className="font-display mt-1 text-[28px] leading-tight sm:text-[36px]">{slide.title}</h2>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="mt-6 text-[15px] leading-relaxed text-ink/90 sm:text-[16px]"
        >
          {slide.section.summary}
        </motion.p>

        <ul className="mt-7 space-y-3">
          {slide.section.claims.map((c, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.18 + i * 0.05 }}
              className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3.5"
            >
              <span
                className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${CONF[c.confidence].cls}`}
              >
                {CONF[c.confidence].label}
              </span>
              <span className="text-[13.5px] leading-relaxed text-ink/90">
                {c.text}
                <span className="font-data ml-1.5 text-[10px] text-mute-2">· {c.source}</span>
              </span>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DecisionSlide({
  submitting,
  flagging,
  flagText,
  setFlagText,
  onApprove,
  onStartFlag,
  onSubmitFlag,
  onCancelFlag,
}: Decision) {
  return (
    <div className="dash-scroll flex h-full w-full items-center justify-center overflow-y-auto px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mx-auto w-full max-w-xl text-center"
      >
        <p className="font-data text-[11px] uppercase tracking-[0.28em] text-molten">Gate 1 · Your call</p>
        <h2 className="font-display mt-4 text-[34px] leading-tight sm:text-[42px]">Approve the strategy?</h2>
        <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-mute">
          Approve and your CMO writes platform-native posts from this. Or flag what&apos;s off and it re-works the
          analysis.
        </p>

        {flagging ? (
          <div className="mt-7 text-left">
            <label htmlFor="flags" className="text-[13px] font-semibold">
              What&apos;s off? (one point per line)
            </label>
            <textarea
              id="flags"
              value={flagText}
              onChange={(e) => setFlagText(e.target.value)}
              rows={4}
              autoFocus
              placeholder={"e.g. Our buyer is enterprise, not SMB\nDrop the discount angle"}
              className="mt-2 w-full resize-none rounded-xl border border-line bg-surface-2 p-3 text-[13px] leading-relaxed text-ink focus:border-molten/40 focus:outline-none"
            />
            <div className="mt-3 flex justify-center gap-2">
              <button
                onClick={onSubmitFlag}
                disabled={submitting || !flagText.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-molten via-amber to-ember px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
              >
                <Flag size={13} aria-hidden /> Send back to re-work
              </button>
              <button
                onClick={onCancelFlag}
                className="rounded-lg px-3 py-2.5 text-[13px] font-semibold text-mute-2 hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-8 flex flex-col items-center gap-3">
            <button
              onClick={onApprove}
              disabled={submitting}
              className="inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-molten via-amber to-ember px-6 py-3.5 text-[14px] font-bold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Working…" : "Approve & generate content"}
              {!submitting && <Check size={16} aria-hidden />}
            </button>
            <button
              onClick={onStartFlag}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-5 py-2.5 text-[13px] font-semibold transition hover:bg-[var(--overlay-subtle)]"
            >
              <Flag size={13} aria-hidden /> Flag what&apos;s off
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
