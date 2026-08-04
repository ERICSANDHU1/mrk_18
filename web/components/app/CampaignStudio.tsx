"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ImageIcon, Loader2, Lock, Sparkles } from "lucide-react";

type Creative = { platform: string; image_url: string; headline: string; caption: string };

/** Create Campaigns — the onboarded founder's ONE free branded campaign: 2 HD
 *  Nano Banana creatives from their Business DNA. Once used, it's shown back with
 *  the paywall. The cap is enforced server-side; this UI just drives it. */
export default function CampaignStudio() {
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [used, setUsed] = useState(false);
  const [onboarded, setOnboarded] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/campaign", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setCreatives(Array.isArray(d.creatives) ? d.creatives : []);
        setUsed(!!d.used || (d.creatives?.length ?? 0) > 0);
        setOnboarded(d.onboarded !== false);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/campaign", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(d.creatives) && d.creatives.length > 0) {
        setCreatives(d.creatives);
        setUsed(true);
      } else {
        setError(d.error || "Couldn't build your campaign — try again.");
      }
    } catch {
      setError("Couldn't reach the campaign engine — is the backend running?");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="dash-scroll h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8">
        <header className="mb-7">
          <p className="font-data text-[11px] uppercase tracking-[0.18em] text-mute-2">
            Create Campaigns
          </p>
          <h1 className="font-display mt-1.5 text-[28px] leading-tight sm:text-[32px]">
            Your CMO&apos;s branded campaign
          </h1>
          <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-mute">
            Two ready-to-post creatives — an Instagram and a LinkedIn image — generated in your
            brand voice, colours and logo. Your free campaign is on the house.
          </p>
        </header>

        {!loaded ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-mute-2" size={22} aria-label="Loading" />
          </div>
        ) : !onboarded ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
            <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl border border-line bg-surface-2 text-molten">
              <Lock size={22} aria-hidden />
            </span>
            <h3 className="font-display text-xl">Finish setting up first</h3>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-mute">
              Your CMO builds campaigns from your company — tell it who you are and it&apos;ll design
              your free campaign.
            </p>
            <Link
              href="/onboarding"
              className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-molten px-5 py-2.5 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
            >
              Set up my CMO <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
        ) : creatives.length > 0 ? (
          <>
            <div className="mb-5 flex items-center gap-2 rounded-xl border border-molten/25 bg-molten/[0.06] px-4 py-3">
              <Check size={16} className="shrink-0 text-molten" aria-hidden />
              <p className="text-[13px] leading-relaxed text-ink/90">
                <span className="font-semibold">Here&apos;s your campaign.</span> You&apos;ve used your
                free campaign —{" "}
                <Link href="/pricing" className="font-semibold text-molten hover:opacity-80">
                  unlock unlimited campaigns
                </Link>{" "}
                to make more.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {creatives.map((c, i) => (
                <div key={i} className="overflow-hidden rounded-2xl border border-line bg-surface">
                  <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                    <span className="text-[12px] font-bold text-ink">{c.platform}</span>
                    <span className="font-data text-[10px] uppercase tracking-wide text-mute-2">
                      Creative {i + 1}
                    </span>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.image_url}
                    alt={`${c.platform} creative`}
                    className="aspect-[4/5] w-full bg-surface-2 object-cover"
                  />
                  <div className="p-4">
                    <p className="text-[13.5px] font-bold leading-snug text-ink">{c.headline}</p>
                    <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-mute">
                      {c.caption}
                    </p>
                    <a
                      href={c.image_url}
                      download={`${c.platform.toLowerCase()}-creative.jpg`}
                      className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-molten transition-opacity hover:opacity-80"
                    >
                      Download image <ArrowRight size={13} aria-hidden />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center">
            <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-molten/30 bg-molten/10 text-molten">
              {busy ? <Loader2 size={26} className="animate-spin" aria-hidden /> : <ImageIcon size={26} aria-hidden />}
            </span>
            <h3 className="font-display text-xl">
              {busy ? "Designing your campaign…" : "Generate your free campaign"}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-mute">
              {busy
                ? "Writing two posts and rendering both images in your brand style. This takes ~20–40 seconds — hang tight."
                : "Your CMO writes two distinct posts and renders both images — Instagram + LinkedIn — from your Business DNA. One free campaign per account."}
            </p>
            {error && (
              <p className="mx-auto mt-4 max-w-md rounded-xl border border-ember/30 bg-ember/[0.06] px-3.5 py-2.5 text-[13px] text-ember">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={generate}
              disabled={busy}
              className="mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[14px] font-bold text-[color:var(--cta-ink,#fff)] transition-transform hover:scale-[1.02] disabled:opacity-60"
              style={{ background: "var(--gradient-brand)" }}
            >
              {busy ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden /> Generating…
                </>
              ) : (
                <>
                  <Sparkles size={16} aria-hidden /> Generate my free campaign
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
