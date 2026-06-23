"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, MessageSquare } from "lucide-react";

interface MediaAsset {
  url: string;
  alt_text?: string | null;
  width?: number;
  height?: number;
  mime?: string;
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

/** The ready-to-post output of a completed run — read-only, with copy. */
export default function ApprovedPosts({ runId }: { runId: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/runs/${runId}/items`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => setItems([]));
  }, [runId]);

  if (!items) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="animate-spin text-mute-2" size={20} aria-hidden />
      </div>
    );
  }

  const approved = items.filter((it) => APPROVED.includes(it.status));
  if (approved.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-surface p-4 text-center text-[13px] text-mute">
        No approved posts in this run.
      </p>
    );
  }

  const copy = (it: Item) => {
    const text = it.thread?.length ? it.thread.join("\n\n") : it.body ?? "";
    navigator.clipboard?.writeText(text);
    setCopied(it.item_id);
    setTimeout(() => setCopied((c) => (c === it.item_id ? null : c)), 1500);
  };

  return (
    <div className="space-y-3 text-left">
      {approved.map((it) => (
        <article key={it.item_id} className="rounded-xl border border-line bg-surface p-4">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <span className="rounded-full border border-molten/30 bg-molten/10 px-2.5 py-0.5 text-[11px] font-bold text-molten">
              {PLATFORM[it.platform] ?? it.platform} · {it.format.replace(/_/g, " ")}
            </span>
            <button
              onClick={() => copy(it)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[12px] font-semibold text-mute transition-colors duration-150 hover:bg-[var(--overlay-subtle)] hover:text-ink"
            >
              {copied === it.item_id ? (
                <>
                  <Check size={12} aria-hidden /> Copied
                </>
              ) : (
                <>
                  <Copy size={12} aria-hidden /> Copy
                </>
              )}
            </button>
          </div>

          {it.thread && it.thread.length > 0 ? (
            <ol className="space-y-2">
              {it.thread.map((seg, i) => (
                <li key={i} className="rounded-lg bg-surface-2 p-3 text-[13.5px] leading-relaxed">
                  <span className="font-data mr-1.5 text-[10px] text-mute-2">
                    {i + 1}/{it.thread!.length}
                  </span>
                  {seg}
                </li>
              ))}
            </ol>
          ) : (
            <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink">{it.body}</p>
          )}

          {it.first_comment && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-surface-2 p-3 text-[12.5px] leading-relaxed text-mute">
              <MessageSquare size={13} className="mt-0.5 shrink-0 text-mute-2" aria-hidden />
              <span>
                <span className="font-semibold text-ink">First comment:</span> {it.first_comment}
              </span>
            </p>
          )}

          {it.media && it.media.length > 0 ? (
            <div className="mt-3 space-y-2">
              {it.media.map((m, i) => (
                <a
                  key={i}
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-xl border border-line transition-opacity duration-150 hover:opacity-90"
                  title="Open full size"
                >
                  {/* external Supabase URL — plain img avoids next/image domain config */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.url}
                    alt={m.alt_text ?? "Generated visual for this post"}
                    loading="lazy"
                    className="block w-full"
                  />
                </a>
              ))}
            </div>
          ) : it.image_prompt ? (
            <p className="font-data mt-3 rounded-lg border border-dashed border-line p-2.5 text-[11px] leading-relaxed text-mute-2">
              🎨 image brief (generate in your image tool): {it.image_prompt}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  );
}
