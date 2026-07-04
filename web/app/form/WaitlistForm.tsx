"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import Logo from "@/components/app/Logo";
import Wordmark from "@/components/app/Wordmark";

const FIELD =
  "w-full rounded-xl border border-stroke bg-white/70 px-4 py-3 text-[15px] text-ink placeholder:text-muted/80 transition-colors focus:border-molten/50 focus:bg-white focus:outline-none";

// A live-feeling queue position — climbs slowly by date (front-end only, not the
// real application count), so the line never looks frozen. Capped under 500.
function queuePosition(): number {
  const start = Date.UTC(2026, 5, 20); // 20 Jun 2026
  const days = Math.max(0, Math.floor((Date.now() - start) / 86_400_000));
  return Math.min(489, 220 + days * 2 + (days % 3));
}

/** Standalone Founding-500 application — the whole page is just this form.
 *  Posts to the public /api/apply (same endpoint + database as the landing). */
export default function WaitlistForm() {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [position, setPosition] = useState(247);
  const [f, setF] = useState({ email: "", phone: "", company: "", issue: "", hp: "" });

  useEffect(() => setPosition(queuePosition()), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.email.trim() || !f.issue.trim() || sending) return;
    setSending(true);
    setErr(null);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: f.email,
          phone: f.phone,
          company: f.company,
          marketing_issue: f.issue,
          hp: f.hp,
        }),
      });
      if (res.ok) setSent(true);
      else {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || "Something went wrong — try again.");
      }
    } catch {
      setErr("Couldn't reach the server — try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/60 bg-white/80 p-7 shadow-2xl shadow-[rgba(27,24,21,0.16)] backdrop-blur-xl sm:p-8">
      {/* brand lockup — identity only, deliberately not a link back to the site */}
      <div className="mb-6 flex items-center gap-2.5">
        <Logo size={26} />
        <Wordmark className="text-[19px] font-extrabold tracking-tight text-ink" />
      </div>

      {sent ? (
        <div className="py-6 text-center">
          <span
            className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl text-white"
            style={{ background: "var(--gradient-brand)" }}
          >
            <Check size={22} aria-hidden />
          </span>
          <h1 className="font-display text-[26px] leading-tight text-ink">You&apos;re #{position} of 500.</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            You&apos;re in early — we&apos;ll reach out about your Founding 500 spot. Thanks for the
            marketing issue; your CMO will be ready for it.
          </p>
        </div>
      ) : (
        <form onSubmit={submit}>
          <span className="inline-flex items-center gap-2 rounded-full border border-molten/30 bg-molten/[0.07] px-3 py-1 text-[11.5px] font-bold uppercase tracking-wide text-molten">
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-molten opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-molten" />
            </span>
            You&apos;re #{position} in line · closes at 500
          </span>
          <h1 className="mt-3 font-display text-[30px] leading-[1.1] text-ink">Apply for Founding 500</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            Founder pricing locked for life — and once 500 are in, this door closes for good. Tell us
            where to reach you and your biggest marketing headache.
          </p>
          <div className="mt-5 space-y-3">
            <input
              type="email"
              required
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
              placeholder="you@company.com"
              className={FIELD}
            />
            <input
              type="tel"
              value={f.phone}
              onChange={(e) => setF({ ...f, phone: e.target.value })}
              placeholder="Phone (optional)"
              className={FIELD}
            />
            <input
              type="text"
              value={f.company}
              onChange={(e) => setF({ ...f, company: e.target.value })}
              placeholder="Company website or name"
              className={FIELD}
            />
            <textarea
              required
              rows={3}
              value={f.issue}
              onChange={(e) => setF({ ...f, issue: e.target.value })}
              placeholder="One marketing issue you keep running into…"
              className={`${FIELD} resize-none`}
            />
            {/* honeypot — humans never see or fill this; bot submissions are dropped */}
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={f.hp}
              onChange={(e) => setF({ ...f, hp: e.target.value })}
              className="hidden"
            />
          </div>
          {err && <p className="mt-3 text-[13px] text-ember">{err}</p>}
          <button
            type="submit"
            disabled={sending}
            className="mt-5 w-full rounded-xl py-3.5 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ background: "var(--gradient-brand)" }}
          >
            {sending ? "Sending…" : "Apply for my spot"}
          </button>
          <p className="mt-3 text-center text-[11px] leading-relaxed text-muted/70">
            No account needed. We only use this to reach you about the Founding 500.
          </p>
        </form>
      )}
    </div>
  );
}
