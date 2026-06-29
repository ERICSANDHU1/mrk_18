"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

/** The Apply / Free pill in the pricing table — opens the application modal. */
export function WaitlistTrigger({
  children,
  highlight,
}: {
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event("mrk18:open-waitlist"))}
      className={`justify-self-start rounded-full px-5 py-2 text-[13px] font-semibold transition-opacity hover:opacity-90 md:justify-self-end ${
        highlight ? "text-white" : "border border-stroke text-ink"
      }`}
      style={highlight ? { background: "var(--gradient-brand)" } : undefined}
    >
      {children}
    </button>
  );
}

const FIELD =
  "w-full rounded-xl border border-stroke bg-surface-2 px-4 py-3 text-[14px] text-ink placeholder:text-muted focus:border-molten/50 focus:outline-none";

/** Founding-50 application modal — posts to /api/apply, which stores it for the
 *  team in Supabase. Opened by any WaitlistTrigger via a window event. */
export default function Waitlist() {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ email: "", phone: "", company: "", issue: "", hp: "" });

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setSent(false);
      setErr(null);
    };
    window.addEventListener("mrk18:open-waitlist", onOpen);
    return () => window.removeEventListener("mrk18:open-waitlist", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Apply for Founding 50"
    >
      <button
        aria-label="Close"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-[rgba(27,24,21,0.5)] backdrop-blur-sm"
      />
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-stroke bg-surface p-7 shadow-2xl">
        <button
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="absolute right-4 top-4 text-muted transition-colors hover:text-ink"
        >
          <X size={18} aria-hidden />
        </button>

        {sent ? (
          <div className="py-6 text-center">
            <span
              className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl text-white"
              style={{ background: "var(--gradient-brand)" }}
            >
              <Check size={22} aria-hidden />
            </span>
            <h3 className="text-xl font-extrabold tracking-tight text-ink">You're on the list.</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              We'll reach out about your Founding 50 spot. Thanks for the marketing issue — your CMO
              will be ready for it.
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h3 className="text-2xl font-extrabold tracking-tight text-ink">Apply for Founding 50</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
              Founder pricing, locked. Tell us where to reach you and your biggest marketing headache.
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
              className="mt-5 w-full rounded-xl py-3 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: "var(--gradient-brand)" }}
            >
              {sending ? "Sending…" : "Apply"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
