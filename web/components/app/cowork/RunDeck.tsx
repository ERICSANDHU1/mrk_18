"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  CornerDownLeft,
  Gem,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Sparkles,
  Square,
  Target,
  TrendingUp,
  Volume2,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Conf, Report, Section } from "./ReportStory";
import TermText from "@/components/app/narrate/TermText";
import { useNarrator, type Narrator } from "@/components/app/narrate/useNarrator";
import type { GlossaryEntry } from "@/lib/glossary";

type TermTap = (entry: GlossaryEntry, sourceId: string) => void;

interface MediaAsset {
  url: string;
  alt_text?: string | null;
}
interface Item {
  item_id: string;
  platform: string;
  format: string;
  body: string | null;
  thread: string[] | null;
  first_comment: string | null;
  image_prompt: string | null;
  media: MediaAsset[] | null;
  status: string;
}

const PLATFORM: Record<string, string> = { linkedin: "LinkedIn", x: "X", instagram: "Instagram" };
const APPROVED = ["approved", "exported", "published"];
const CONF: Record<Conf, { label: string; cls: string }> = {
  high: { label: "high", cls: "text-molten border-molten/30 bg-molten/10" },
  medium: { label: "medium", cls: "text-amber border-amber/30 bg-amber/10" },
  low: { label: "low", cls: "text-mute-2 border-line bg-surface-2" },
};

type DeckSlide =
  | { kind: "verdict"; synthesis: string; flags: string[] }
  | { kind: "section"; n: number; title: string; icon: LucideIcon; section: Section }
  | { kind: "post"; item: Item; index: number; total: number }
  | { kind: "image"; item: Item; index: number; total: number }
  | { kind: "summary"; count: number };

type ChatMsg = { id: string; role: "you" | "cmo"; text: string };

// each slide's chat routes to THIS adapter (confirmed design: 1 slide = 1 adapter,
// the verdict/synthesis seat orchestrates the whole-run questions).
const SECTION_ADAPTER: Record<string, string> = {
  "Market Intelligence": "market_intel",
  "Audience & Positioning": "audience",
  "USP & Differentiation": "usp",
  "Content Strategy": "strategy",
};
const ADAPTER_LABEL: Record<string, string> = {
  verdict: "Strategy",
  market_intel: "Market intel",
  audience: "Audience",
  usp: "USP",
  strategy: "Content strategy",
  content: "Ad copy",
};

/** Which adapter the current slide's chat hits + the context that grounds it. */
function chatMetaFor(slide: DeckSlide): { key: string; adapter: string; context: string; label: string } {
  switch (slide.kind) {
    case "verdict":
      return { key: "verdict", adapter: "verdict", context: slide.synthesis, label: "the Verdict" };
    case "section":
      return {
        key: `sec-${slide.n}`,
        adapter: SECTION_ADAPTER[slide.title] ?? "verdict",
        context: `${slide.title}\n\n${slide.section.summary}\n\n${slide.section.claims.map((c) => `• ${c.text}`).join("\n")}`,
        label: slide.title,
      };
    case "post": {
      const it = slide.item;
      const body = it.thread?.length ? it.thread.join("\n\n") : (it.body ?? "");
      return {
        key: `post-${it.item_id}`,
        adapter: "content",
        context: `${PLATFORM[it.platform] ?? it.platform} ${it.format.replace(/_/g, " ")}:\n${body}${it.first_comment ? `\n\nFirst comment: ${it.first_comment}` : ""}`,
        label: "this post",
      };
    }
    case "image": {
      const it = slide.item;
      return {
        key: `img-${it.item_id}`,
        adapter: "content",
        context: `Image brief for the ${PLATFORM[it.platform] ?? it.platform} post: ${it.image_prompt ?? it.media?.[0]?.alt_text ?? "the visual"}`,
        label: "this visual",
      };
    }
    case "summary":
      return {
        key: "summary",
        adapter: "verdict",
        context: `The finished campaign: ${slide.count} approved posts ready to ship.`,
        label: "this run",
      };
  }
}

/** The whole finished run as a swipeable deck: analysis → each post → each image. */
export default function RunDeck({ report, runId }: { report: Report | null; runId: string }) {
  const reduce = useReducedMotion();
  const [items, setItems] = useState<Item[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // per-slide follow-up chat — one independent thread per slide, each routed to
  // that slide's adapter. Serialized (one request in flight) to respect cold starts.
  const [threads, setThreads] = useState<Record<string, ChatMsg[]>>({});
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState(false);
  const [warming, setWarming] = useState(false);
  const [chatErr, setChatErr] = useState<string | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  // CMO narration — speaks a block and highlights the word being spoken; tapping
  // a jargon term opens a spoken definition.
  const narrator = useNarrator();
  const { narrate, stop } = narrator;
  const [def, setDef] = useState<{ entry: GlossaryEntry } | null>(null);
  const onTermTap = useCallback<TermTap>(
    (entry) => {
      setDef({ entry });
      narrate(entry.definition, `def:${entry.term}`);
    },
    [narrate],
  );

  useEffect(() => {
    fetch(`/api/runs/${runId}/items`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => setItems([]));
  }, [runId]);

  const slides = useMemo<DeckSlide[]>(() => {
    const s: DeckSlide[] = [];
    if (report?.synthesis) s.push({ kind: "verdict", synthesis: report.synthesis, flags: report.founder_flags ?? [] });
    if (report?.market_intel) s.push({ kind: "section", n: 1, title: "Market Intelligence", icon: TrendingUp, section: report.market_intel });
    if (report?.audience_positioning) s.push({ kind: "section", n: 2, title: "Audience & Positioning", icon: Target, section: report.audience_positioning });
    if (report?.usp_positioning) s.push({ kind: "section", n: 3, title: "USP & Differentiation", icon: Gem, section: report.usp_positioning });
    if (report?.content_strategy) s.push({ kind: "section", n: 4, title: "Content Strategy", icon: Sparkles, section: report.content_strategy });
    const approved = (items ?? []).filter((it) => APPROVED.includes(it.status));
    approved.forEach((it, i) => {
      s.push({ kind: "post", item: it, index: i + 1, total: approved.length });
      if ((it.media && it.media.length > 0) || it.image_prompt) s.push({ kind: "image", item: it, index: i + 1, total: approved.length });
    });
    if (approved.length > 0) s.push({ kind: "summary", count: approved.length });
    return s;
  }, [report, items]);

  const [[index, dir], setState] = useState<[number, number]>([0, 0]);
  const go = useCallback(
    (next: number, d: number) => setState([Math.max(0, Math.min(Math.max(slides.length - 1, 0), next)), d]),
    [slides.length],
  );
  const paginate = useCallback((d: number) => go(index + d, d), [go, index]);

  // deep-link: /cowork/run/<id>?item=<item_id> opens straight on that post's
  // slide (e.g. from the Content & scripts list) instead of the verdict. Runs
  // once, after the posts load, then leaves navigation to the founder.
  const jumpedRef = useRef(false);
  useEffect(() => {
    if (jumpedRef.current || items === null) return;
    let target: string | null = null;
    try {
      target = new URLSearchParams(window.location.search).get("item");
    } catch {}
    if (target) {
      const i = slides.findIndex((s) => s.kind === "post" && s.item.item_id === target);
      if (i > 0) setState([i, 0]);
    }
    jumpedRef.current = true; // items are loaded now — don't fight the user after this
  }, [slides, items]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") paginate(1);
      else if (e.key === "ArrowLeft") paginate(-1);
      else if (e.key === "Escape") stop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paginate, stop]);

  // changing slides stops any narration and closes an open definition
  useEffect(() => {
    stop();
    setDef(null);
    setDraft("");
    setChatErr(null); // each slide keeps its own thread; the composer resets
  }, [index, stop]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [threads, asking]);

  useEffect(() => {
    if (!asking) {
      setWarming(false);
      return;
    }
    const t = setTimeout(() => setWarming(true), 12_000);
    return () => clearTimeout(t);
  }, [asking]);

  // ask this slide's adapter — appends to the slide's own thread, cold-start-aware
  const ask = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q || asking) return;
      const meta = chatMetaFor(slides[Math.min(index, slides.length - 1)]);
      const key = meta.key;
      const prior = threads[key] ?? [];
      setThreads((t) => ({ ...t, [key]: [...prior, { id: `u-${Date.now()}`, role: "you", text: q }] }));
      setDraft("");
      setChatErr(null);
      setAsking(true);
      const msgs = [
        ...prior.map((m) => ({ role: m.role === "cmo" ? "assistant" : "user", content: m.text })),
        { role: "user", content: q },
      ].slice(-20);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 150_000);
      try {
        const res = await fetch(`/api/runs/${runId}/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adapter: meta.adapter, context: meta.context, messages: msgs }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setChatErr(data?.error || "The CMO couldn't respond — try again.");
        } else if (typeof data.reply === "string") {
          setThreads((t) => ({
            ...t,
            [key]: [...(t[key] ?? []), { id: `c-${Date.now()}`, role: "cmo", text: data.reply }],
          }));
        }
      } catch (e) {
        clearTimeout(timer);
        setChatErr(
          e instanceof DOMException && e.name === "AbortError"
            ? "The engine's warming up (a cold start can take a minute) — try again in a moment."
            : "Couldn't reach the CMO.",
        );
      } finally {
        setAsking(false);
      }
    },
    [asking, index, runId, slides, threads],
  );

  const copy = (it: Item) => {
    const text = it.thread?.length ? it.thread.join("\n\n") : it.body ?? "";
    navigator.clipboard?.writeText(text);
    setCopied(it.item_id);
    setTimeout(() => setCopied((c) => (c === it.item_id ? null : c)), 1500);
  };

  const variants = {
    enter: (d: number) => ({ x: d >= 0 ? "100%" : "-100%", opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d >= 0 ? "-100%" : "100%", opacity: 0 }),
  };

  if (items === null) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg">
        <Loader2 className="animate-spin text-molten" size={26} aria-hidden />
      </div>
    );
  }
  if (slides.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
        <p className="text-[14px] text-mute">Nothing to show for this run yet.</p>
        <Link href="/cowork" className="rounded-lg border border-line px-4 py-2 text-[13px] font-semibold hover:bg-[var(--overlay-subtle)]">
          Back to workspace
        </Link>
      </div>
    );
  }

  const slide = slides[Math.min(index, slides.length - 1)];
  const last = slides.length - 1;
  const chatMeta = chatMetaFor(slide);
  const thread = threads[chatMeta.key] ?? [];

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-bg">
      <div aria-hidden className="pointer-events-none absolute -top-1/3 left-1/2 h-[70vh] w-[70vh] -translate-x-1/2 rounded-full bg-molten/10 blur-[120px]" />

      <header className="relative z-10 flex items-center gap-4 px-5 pt-5 sm:px-8">
        <Link href="/cowork" className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-mute transition-colors hover:text-ink">
          <ArrowLeft size={14} aria-hidden /> Workspace
        </Link>
        <div className="flex flex-1 gap-1.5">
          {slides.map((_, i) => (
            <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-[rgba(27,24,21,0.08)]">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-molten to-ember" initial={false} animate={{ width: i <= index ? "100%" : "0%" }} transition={{ duration: 0.4, ease: "easeOut" }} />
            </div>
          ))}
        </div>
        <span className="font-data shrink-0 text-[11px] text-mute-2">
          {index + 1}/{slides.length}
        </span>
      </header>

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
            {slide.kind === "verdict" && <VerdictSlide synthesis={slide.synthesis} flags={slide.flags} narrator={narrator} onTermTap={onTermTap} />}
            {slide.kind === "section" && <SectionSlide slide={slide} narrator={narrator} onTermTap={onTermTap} />}
            {slide.kind === "post" && (
              <PostSlide item={slide.item} index={slide.index} total={slide.total} copied={copied === slide.item.item_id} onCopy={() => copy(slide.item)} />
            )}
            {slide.kind === "image" && <ImageSlide item={slide.item} index={slide.index} total={slide.total} />}
            {slide.kind === "summary" && <SummarySlide count={slide.count} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* spoken definition — words highlight as the CMO explains the term */}
      <AnimatePresence>
        {def && (
          <motion.div
            key="def"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="absolute inset-x-4 bottom-20 z-20 mx-auto max-w-lg rounded-2xl border border-molten/30 bg-surface p-4 shadow-xl shadow-[var(--shadow-color)] sm:inset-x-auto sm:left-1/2 sm:w-[28rem] sm:-translate-x-1/2"
          >
            <div className="mb-1.5 flex items-center justify-between">
              <p className="font-data inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-molten">
                <Volume2 size={13} aria-hidden /> {def.entry.term}
              </p>
              <button
                onClick={() => {
                  stop();
                  setDef(null);
                }}
                aria-label="Close"
                className="grid h-6 w-6 place-items-center rounded-md text-mute transition hover:bg-surface-2 hover:text-ink"
              >
                <X size={14} aria-hidden />
              </button>
            </div>
            <p className="text-[13.5px] leading-relaxed text-ink/90">
              <TermText id={`def:${def.entry.term}`} text={def.entry.definition} narrator={narrator} onTermTap={onTermTap} />
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* per-slide chat — routed to THIS slide's adapter (verdict orchestrates) */}
      <div className="relative z-10 mx-auto w-full max-w-3xl px-5 sm:px-8">
        {thread.length > 0 && (
          <div ref={chatRef} className="dash-scroll mb-2 max-h-44 space-y-2 overflow-y-auto rounded-2xl border border-line bg-surface p-3.5 shadow-lg shadow-[var(--shadow-color)]">
            {thread.map((m) => (
              <div key={m.id} className={`flex ${m.role === "you" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                    m.role === "cmo"
                      ? "rounded-tl-sm border border-molten/20 bg-molten/[0.07] text-ink"
                      : "rounded-tr-sm bg-surface-2 text-ink"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {asking && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-tl-sm border border-molten/20 bg-molten/[0.07] px-3 py-1.5 text-[12px] text-mute">
                  {warming ? "engine warming up…" : "thinking…"}
                </div>
              </div>
            )}
          </div>
        )}
        {chatErr && <p className="mb-1.5 px-1 text-[11.5px] text-ember">{chatErr}</p>}
        <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3 shadow-lg shadow-[var(--shadow-color)] transition-colors focus-within:border-molten/50">
          <span
            className="font-data hidden shrink-0 items-center gap-1 rounded-md bg-molten/[0.08] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-molten sm:inline-flex"
            title="This chat is routed to this slide's adapter"
          >
            <span aria-hidden>◆</span> {ADAPTER_LABEL[chatMeta.adapter]}
          </span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                ask(draft);
              }
            }}
            placeholder={`Ask about ${chatMeta.label}…`}
            style={{ outline: "none" }}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-ink placeholder:text-mute"
          />
          <button
            onClick={() => ask(draft)}
            disabled={!draft.trim() || asking}
            aria-label="Ask this slide's adapter"
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${
              draft.trim() && !asking ? "bg-molten text-white hover:opacity-90" : "bg-surface-2 text-mute-2"
            }`}
          >
            {asking ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <CornerDownLeft size={16} aria-hidden />}
          </button>
        </div>
      </div>

      <footer className="relative z-10 flex items-center justify-between px-5 pb-5 pt-3 sm:px-8">
        <button onClick={() => paginate(-1)} disabled={index === 0} aria-label="Previous" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-mute transition hover:bg-[var(--overlay-subtle)] disabled:opacity-30">
          <ChevronLeft size={18} aria-hidden />
        </button>
        <div className="flex items-center gap-2">
          {slides.map((_, i) => (
            <button key={i} onClick={() => go(i, i > index ? 1 : -1)} aria-label={`Go to slide ${i + 1}`} className={`h-2 rounded-full transition-all duration-300 ${i === index ? "w-6 bg-molten" : "w-2 bg-[rgba(27,24,21,0.16)] hover:bg-[rgba(27,24,21,0.28)]"}`} />
          ))}
        </div>
        {index === last ? (
          <Link href="/cowork" className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line px-4 text-[13px] font-semibold transition hover:bg-[var(--overlay-subtle)]">
            Done
          </Link>
        ) : (
          <button onClick={() => paginate(1)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-molten px-4 text-[13px] font-bold text-white transition hover:opacity-90">
            Next <ChevronRight size={16} aria-hidden />
          </button>
        )}
      </footer>
    </div>
  );
}

/** "Explain this" ⇆ "Stop" — narrates `text` (tagged `id`) and toggles while it
 *  speaks that block. Hidden where speech synthesis isn't available. */
function ExplainButton({ narrator, text, id }: { narrator: Narrator; text: string; id: string }) {
  if (!narrator.supported) return null;
  const onThis = narrator.speaking && narrator.activeId === id;
  return (
    <button
      type="button"
      onClick={() => (onThis ? narrator.stop() : narrator.narrate(text, id))}
      className="inline-flex items-center gap-1.5 rounded-full border border-molten/30 bg-molten/10 px-3.5 py-1.5 text-[12px] font-bold text-molten transition hover:bg-molten/15"
    >
      {onThis ? (
        <>
          <Square size={12} aria-hidden /> Stop
        </>
      ) : (
        <>
          <Volume2 size={13} aria-hidden /> Explain this
        </>
      )}
    </button>
  );
}

function VerdictSlide({ synthesis, flags, narrator, onTermTap }: { synthesis: string; flags: string[]; narrator: Narrator; onTermTap: TermTap }) {
  return (
    <div className="dash-scroll flex h-full w-full items-center justify-center overflow-y-auto px-6 py-10">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mx-auto max-w-2xl text-center">
        <p className="font-data inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-molten">
          <Brain size={13} aria-hidden /> Run complete · your CMO
        </p>
        <h1 className="font-display mt-5 text-[40px] leading-[1.04] sm:text-[56px]">The Verdict</h1>
        <div className="mt-4 flex justify-center">
          <ExplainButton narrator={narrator} text={synthesis} id="verdict" />
        </div>
        <p className="mt-5 whitespace-pre-line text-left text-[15px] leading-relaxed text-ink/90 sm:text-[17px]">
          <TermText id="verdict" text={synthesis} narrator={narrator} onTermTap={onTermTap} />
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

function SummarySlide({ count }: { count: number }) {
  return (
    <div className="dash-scroll flex h-full w-full items-center justify-center overflow-y-auto px-6 py-10">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mx-auto max-w-lg text-center">
        <span className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-molten/30 bg-molten/10 text-molten">
          <Sparkles size={30} aria-hidden />
        </span>
        <h1 className="font-display text-[40px] leading-[1.05] sm:text-[52px]">Your campaign is ready</h1>
        <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-mute sm:text-[16px]">
          {count} {count === 1 ? "post is" : "posts are"} approved and ready to ship — copy any one from
          its slide, or come back to publish when you connect your channels.
        </p>
        <Link href="/cowork" className="mt-7 inline-flex items-center gap-1.5 rounded-full bg-molten px-6 py-3 text-[14px] font-bold text-white transition hover:opacity-90">
          <ArrowLeft size={15} aria-hidden /> Back to workspace
        </Link>
      </motion.div>
    </div>
  );
}

function SectionSlide({ slide, narrator, onTermTap }: { slide: Extract<DeckSlide, { kind: "section" }>; narrator: Narrator; onTermTap: TermTap }) {
  const Icon = slide.icon;
  const id = `sec-${slide.n}`;
  return (
    <div className="dash-scroll h-full w-full overflow-y-auto px-6 py-10 sm:px-12">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-4">
          <span className="font-display text-[64px] leading-none text-molten/15 sm:text-[88px]">0{slide.n}</span>
          <div>
            <p className="font-data inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-mute-2">
              <Icon size={13} className="text-molten" aria-hidden /> Intelligence
            </p>
            <h2 className="font-display mt-1 text-[28px] leading-tight sm:text-[36px]">{slide.title}</h2>
          </div>
        </div>
        <div className="mt-5">
          <ExplainButton narrator={narrator} text={slide.section.summary} id={id} />
        </div>
        <p className="mt-3 text-[15px] leading-relaxed text-ink/90 sm:text-[16px]">
          <TermText id={id} text={slide.section.summary} narrator={narrator} onTermTap={onTermTap} />
        </p>
        <ul className="mt-7 space-y-3">
          {slide.section.claims.map((c, i) => {
            const conf = CONF[c.confidence] ?? CONF.low;
            return (
              <li key={i} className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3.5">
                <span className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${conf.cls}`}>{conf.label}</span>
                <span className="text-[13.5px] leading-relaxed text-ink/90">
                  <TermText id={`${id}-c${i}`} text={c.text} narrator={narrator} onTermTap={onTermTap} />
                  {c.source && <span className="font-data ml-1.5 text-[10px] text-mute-2">· {c.source}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function PostSlide({ item, index, total, copied, onCopy }: { item: Item; index: number; total: number; copied: boolean; onCopy: () => void }) {
  return (
    <div className="dash-scroll h-full w-full overflow-y-auto px-6 py-10 sm:px-12">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-data text-[11px] uppercase tracking-[0.22em] text-mute-2">
              Ready to post{total > 1 ? ` · ${index}/${total}` : ""}
            </p>
            <h2 className="font-display mt-1 text-[26px] leading-tight sm:text-[32px]">
              {PLATFORM[item.platform] ?? item.platform} {item.format.replace(/_/g, " ")}
            </h2>
          </div>
          <button onClick={onCopy} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold text-mute transition-colors hover:bg-[var(--overlay-subtle)] hover:text-ink">
            {copied ? (
              <>
                <Check size={13} aria-hidden /> Copied
              </>
            ) : (
              <>
                <Copy size={13} aria-hidden /> Copy
              </>
            )}
          </button>
        </div>
        <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
          {item.thread && item.thread.length > 0 ? (
            <ol className="space-y-2.5">
              {item.thread.map((seg, i) => (
                <li key={i} className="rounded-lg bg-surface-2 p-3.5 text-[14px] leading-relaxed">
                  <span className="font-data mr-1.5 text-[10px] text-mute-2">
                    {i + 1}/{item.thread!.length}
                  </span>
                  {seg}
                </li>
              ))}
            </ol>
          ) : (
            <p className="whitespace-pre-line text-[14.5px] leading-relaxed text-ink">{item.body}</p>
          )}
          {item.first_comment && (
            <p className="mt-4 flex items-start gap-2 rounded-lg border border-line bg-surface-2 p-3 text-[12.5px] leading-relaxed text-mute">
              <MessageSquare size={13} className="mt-0.5 shrink-0 text-mute-2" aria-hidden />
              <span>
                <span className="font-semibold text-ink">First comment:</span> {item.first_comment}
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ImageSlide({ item, index, total }: { item: Item; index: number; total: number }) {
  const hasMedia = item.media && item.media.length > 0;
  return (
    <div className="dash-scroll h-full w-full overflow-y-auto px-6 py-10 sm:px-12">
      <div className="mx-auto max-w-2xl">
        <p className="font-data text-[11px] uppercase tracking-[0.22em] text-mute-2">
          <ImageIcon size={13} className="mr-1.5 inline align-[-2px] text-molten" aria-hidden /> Visual{total > 1 ? ` · ${index}/${total}` : ""}
        </p>
        <h2 className="font-display mt-1 text-[26px] leading-tight sm:text-[32px]">{hasMedia ? "The image" : "Image brief"}</h2>
        {hasMedia ? (
          <div className="mt-6 space-y-3">
            {item.media!.map((m, i) => (
              <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl border border-line transition-opacity hover:opacity-90" title="Open full size">
                {/* external Supabase URL — plain img avoids next/image domain config */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt={m.alt_text ?? "Generated visual for this post"} loading="lazy" className="block w-full" />
              </a>
            ))}
            {item.image_prompt && (
              <p className="font-data rounded-xl border border-dashed border-line p-3 text-[11px] leading-relaxed text-mute-2">Prompt: {item.image_prompt}</p>
            )}
          </div>
        ) : (
          <p className="font-data mt-6 whitespace-pre-line rounded-2xl border border-dashed border-line bg-surface p-5 text-[13px] leading-relaxed text-ink/80">
            🎨 {item.image_prompt}
          </p>
        )}
      </div>
    </div>
  );
}
