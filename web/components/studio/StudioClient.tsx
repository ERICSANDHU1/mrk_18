"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import Navbar from "@/components/Navbar";

/** /studio (bare) — a clean, ANONYMOUS entry point. Drop a URL and it routes into
 *  the unified Studio (/studio/[domain]) which runs the taster verdict + the real
 *  Business DNA + the CMO agent. No sign-in wall, no stale auto-load — the whole
 *  read is free; only Create Campaigns converts. */

export default function StudioClient() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = () => {
    const domain = url
      .trim()
      .replace(/^https?:\/\//i, "")
      .split("/")[0]
      .replace(/^www\./i, "");
    if (!domain || !domain.includes(".")) {
      setErr("that doesn't look like a website — try something like yourbusiness.com");
      return;
    }
    setErr(null);
    setBusy(true);
    router.push(`/studio/${encodeURIComponent(domain)}`);
  };

  return (
    <div className="min-h-screen bg-bg text-ink">
      <Navbar appearance />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-32">
        <div className="mb-6 text-center">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-ink md:text-4xl">
            Your Studio
          </h1>
          <p className="mt-1.5 text-[14px] text-muted">
            Drop your URL — your CMO reads your brand cold, then builds your marketing.
          </p>
        </div>

        <div className="glass mx-auto max-w-xl rounded-2xl p-6 md:p-8">
          <div className="flex items-center gap-2 rounded-2xl border border-stroke bg-surface p-1.5 pl-4">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && go()}
              disabled={busy}
              placeholder="yourbusiness.com"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-mute-2 focus:outline-none"
              aria-label="Your website URL"
            />
            <button
              onClick={go}
              disabled={busy || !url.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold text-[color:var(--cta-ink,#fff)] transition-opacity disabled:opacity-50"
              style={{ background: "var(--gradient-brand)" }}
            >
              {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Sparkles size={15} aria-hidden />}
              {busy ? "Opening…" : "Analyze"}
            </button>
          </div>
          {err && <p className="mt-2 text-center text-[12.5px] font-medium text-bad">{err}</p>}
          <p className="mt-3 text-center text-[11.5px] text-mute-2">
            Free · no sign-up · your CMO reads it cold and remembers it for everything next.
          </p>
        </div>
      </main>
    </div>
  );
}
