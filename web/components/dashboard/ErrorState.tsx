"use client";

import { RotateCcw } from "lucide-react";

/** Plain-language failure + retry. Used by error boundaries and panels. */
export default function ErrorState({
  title = "That panel didn't load",
  body = "The data request failed — your numbers are safe, the view isn't. Try again.",
  onRetry,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-bad/25 bg-bad/5 px-6 py-12 text-center">
      <h3 className="text-[15px] font-bold tracking-tight text-bad">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{body}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-lg border border-stroke-2 bg-surface-2 px-4 py-2 text-[13px] font-semibold transition-colors duration-200 hover:bg-white/5"
        >
          <RotateCcw size={14} aria-hidden />
          Retry
        </button>
      )}
    </div>
  );
}
