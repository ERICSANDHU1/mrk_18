"use client";

import { Fragment, useMemo } from "react";
import { findTerms, type GlossaryEntry } from "@/lib/glossary";
import type { Narrator } from "./useNarrator";

type Token = {
  text: string;
  start: number;
  end: number;
  type: "space" | "word" | "term";
  entry?: GlossaryEntry;
};

/** Split text into tokens: glossary terms stay whole (and tappable), everything
 *  else splits into words (so each can highlight) and whitespace runs. Every
 *  token carries its char range so onboundary's charIndex maps to the right one. */
function tokenize(text: string): Token[] {
  const terms = findTerms(text);
  const tokens: Token[] = [];
  let i = 0;
  let ti = 0;
  while (i < text.length) {
    const next = terms[ti];
    if (next && next.start <= i) {
      if (next.start === i) {
        tokens.push({ text: text.slice(next.start, next.end), start: next.start, end: next.end, type: "term", entry: next.entry });
        i = next.end;
      }
      ti++;
      continue;
    }
    const stop = next ? next.start : text.length;
    const rest = text.slice(i, stop);
    const re = /\s+|\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(rest)) !== null) {
      const seg = m[0];
      const start = i + m.index;
      tokens.push({ text: seg, start, end: start + seg.length, type: /^\s+$/.test(seg) ? "space" : "word" });
    }
    i = stop;
  }
  return tokens;
}

/** Renders text with: (1) the currently-spoken word highlighted (when the
 *  narrator's activeId matches this id), and (2) marketing terms underlined +
 *  tappable to hear their definition. */
export default function TermText({
  id,
  text,
  narrator,
  onTermTap,
  className = "",
}: {
  id: string;
  text: string;
  narrator: Narrator;
  onTermTap: (entry: GlossaryEntry, sourceId: string) => void;
  className?: string;
}) {
  const tokens = useMemo(() => tokenize(text), [text]);
  const active = narrator.activeId === id;

  return (
    <span className={className}>
      {tokens.map((tk, idx) => {
        if (tk.type === "space") return <Fragment key={idx}>{tk.text}</Fragment>;
        const spoken = active && narrator.charIndex >= tk.start && narrator.charIndex < tk.end;

        if (tk.type === "term") {
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onTermTap(tk.entry!, id)}
              title={`What does ${tk.entry!.term} mean? — tap to hear`}
              className={`inline whitespace-nowrap rounded px-0.5 align-baseline underline decoration-dotted decoration-molten/60 underline-offset-2 transition-colors ${
                spoken ? "bg-molten/25 text-molten" : "text-molten hover:bg-molten/10"
              }`}
            >
              {tk.text}
            </button>
          );
        }

        return (
          <span key={idx} className={spoken ? "rounded bg-molten/25 text-ink" : undefined}>
            {tk.text}
          </span>
        );
      })}
    </span>
  );
}
