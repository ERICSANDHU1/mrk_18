"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, MessageSquare, Pencil, X } from "lucide-react";

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

type Decision = { action: "approve" | "reject"; note: string };

const PLATFORM: Record<string, string> = { linkedin: "LinkedIn", x: "X", instagram: "Instagram" };

/** Gate 2 — per-post approval. Nothing publishes without a decision here. */
export default function Gate2Review({
  runId,
  onSubmitted,
}: {
  runId: string;
  onSubmitted: () => void;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/runs/${runId}/items`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => setItems([]));
  }, [runId]);

  const decide = (id: string, action: "approve" | "reject") =>
    setDecisions((d) => ({ ...d, [id]: { action, note: d[id]?.note ?? "" } }));
  const setNote = (id: string, note: string) =>
    setDecisions((d) => ({ ...d, [id]: { action: d[id]?.action ?? "reject", note } }));

  const allDecided = !!items && items.length > 0 && items.every((it) => decisions[it.item_id]);

  const submit = async () => {
    if (!items || !allDecided) return;
    setSubmitting(true);
    const payload = {
      decisions: items.map((it) => {
        const dec = decisions[it.item_id];
        return {
          item_id: it.item_id,
          action: dec.action,
          note: dec.action === "reject" ? dec.note.trim() || null : null,
        };
      }),
    };
    await fetch(`/api/runs/${runId}/gate2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
    setSubmitting(false);
    onSubmitted();
  };

  if (!items) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-mute-2" size={22} aria-label="Loading your content" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="font-data text-[11px] uppercase tracking-[0.18em] text-mute-2">Gate 2 · Content review</p>
        <h1 className="font-display mt-1.5 text-2xl">Approve what goes out</h1>
        <p className="mt-1 text-[13px] text-mute">
          Your CMO wrote these from the approved strategy. Approve each, or reject with a note to re-work it.
          Nothing publishes without your call.
        </p>
      </div>

      {items.map((it) => {
        const dec = decisions[it.item_id];
        return (
          <article key={it.item_id} className="rounded-2xl border border-line bg-surface p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[11px] font-bold">
                {PLATFORM[it.platform] ?? it.platform}
              </span>
              <span className="font-data text-[10px] uppercase tracking-[0.12em] text-mute-2">
                {it.format.replace(/_/g, " ")}
              </span>
            </div>

            {it.thread && it.thread.length > 0 ? (
              <ol className="space-y-2">
                {it.thread.map((seg, i) => (
                  <li key={i} className="rounded-lg bg-surface-2 p-3 text-[13.5px] leading-relaxed">
                    <span className="font-data mr-1.5 text-[10px] text-mute-2">{i + 1}/{it.thread!.length}</span>
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
                <span><span className="font-semibold text-ink">First comment:</span> {it.first_comment}</span>
              </p>
            )}

            {it.media && it.media.length > 0 ? (
              <div className="mt-3 space-y-2">
                {it.media.map((m, i) => (
                  <figure key={i} className="overflow-hidden rounded-xl border border-line">
                    {/* external Supabase URL — plain img avoids next/image domain config */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.url}
                      alt={m.alt_text ?? "Generated visual for this post"}
                      loading="lazy"
                      className="block w-full"
                    />
                  </figure>
                ))}
              </div>
            ) : (
              it.image_prompt && (
                <p className="font-data mt-3 rounded-lg border border-dashed border-line p-2.5 text-[11px] leading-relaxed text-mute-2">
                  🎨 image brief: {it.image_prompt}
                </p>
              )
            )}

            {/* decision */}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
              <button
                onClick={() => decide(it.item_id, "approve")}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors duration-150 ${
                  dec?.action === "approve"
                    ? "border-molten/40 bg-molten/10 text-molten"
                    : "border-line text-mute hover:text-ink"
                }`}
              >
                <Check size={13} aria-hidden /> Approve
              </button>
              <button
                onClick={() => decide(it.item_id, "reject")}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors duration-150 ${
                  dec?.action === "reject"
                    ? "border-ember/40 bg-ember/10 text-ember"
                    : "border-line text-mute hover:text-ink"
                }`}
              >
                <X size={13} aria-hidden /> Reject &amp; re-work
              </button>
            </div>

            {dec?.action === "reject" && (
              <div className="mt-2.5 flex items-start gap-2">
                <Pencil size={13} className="mt-2 shrink-0 text-mute-2" aria-hidden />
                <textarea
                  value={dec.note}
                  onChange={(e) => setNote(it.item_id, e.target.value)}
                  rows={2}
                  placeholder="What should change? (your CMO rewrites it once)"
                  className="w-full resize-none rounded-lg border border-line bg-surface-2 p-2.5 text-[13px] leading-relaxed text-ink focus:border-molten/40 focus:outline-none"
                />
              </div>
            )}
          </article>
        );
      })}

      {/* submit */}
      <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/95 p-4 backdrop-blur">
        <p className="font-data text-[12px] text-mute">
          {Object.keys(decisions).length}/{items.length} decided
        </p>
        <button
          onClick={submit}
          disabled={!allDecided || submitting}
          className="inline-flex items-center gap-1.5 rounded-lg bg-molten px-5 py-2 text-[13px] font-bold text-white transition-opacity duration-200 hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Submit decisions"}
          {!submitting && <Check size={14} aria-hidden />}
        </button>
      </div>
    </div>
  );
}
