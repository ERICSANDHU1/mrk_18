"use client";

import { useEffect, useState } from "react";
import { Check, Lock, X } from "lucide-react";
import { FOUNDING_500 } from "@/lib/founding500";

/** Ask 2 — the upgrade modal. Opened by a locked sidebar item
 *  (mrk18:open-upgrade with detail.feature = "Comrk" | "Chief"). The toast
 *  (Ask 1) already primed Founding 500; this is where the full pitch + form
 *  live and the conversion closes. Posts to /api/apply — the same table as the
 *  landing waitlist — so every Founding 500 signup lands in one place.
 *
 *  Fulfillment is confirm-later: the CTA stays "Lock Founding 500 Pricing"
 *  regardless (there's no live billing yet), and the row is the founder's
 *  follow-up list. */

const FIELD =
  "w-full rounded-xl border border-stroke bg-surface-2 px-4 py-3 text-[14px] text-ink placeholder:text-muted focus:border-molten/50 focus:outline-none";

const PERKS = [
  "Comrk execution pipeline",
  "Chief analytics command center",
  "Priority model access",
  "Price never goes up for you",
];

export default function UpgradeModal() {
  const [open, setOpen] = useState(false);
  const [feature, setFeature] = useState("Comrk");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", company: "", email: "", hp: "" });

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { feature?: string } | undefined;
      setFeature(detail?.feature || "Comrk");
      setSent(false);
      setErr(null);
      setOpen(true);
    };
    window.addEventListener("mrk18:open-upgrade", onOpen);
    return () => window.removeEventListener("mrk18:open-upgrade", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.email.trim() || sending) return;
    setSending(true);
    setErr(null);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: f.email,
          company: f.company,
          // /apply requires a non-empty marketing_issue; pack the name + intent
          // so the founder's follow-up list carries who + what they wanted.
          marketing_issue: `Founding 500 upgrade — wants ${feature}. Name: ${f.name || "(not given)"}`,
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
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Unlock ${feature} with Founding 500`}
    >
      <button
        aria-label="Close"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-[rgba(27,24,21,0.55)] backdrop-blur-sm"
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
            <h3 className="text-xl font-extrabold tracking-tight text-ink">Your spot is being held.</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              Founding 500 pricing is locked to your email — we&apos;ll reach out to get you into{" "}
              {feature} and the rest of the CMO&apos;s team.
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-molten/30 bg-molten/[0.07] px-3 py-1 text-[11.5px] font-bold uppercase tracking-wide text-molten">
              <Lock size={12} aria-hidden />
              {feature} is part of Founding 500
            </span>
            <h3 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight text-ink">
              You&apos;ve got the CMO. Now unlock the team that executes.
            </h3>

            {/* price block — the offer, front and center */}
            <div className="mt-5 rounded-2xl border border-stroke bg-surface-2 p-4">
              <p className="font-data text-[11px] uppercase tracking-[0.18em] text-muted">Founding 500</p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="font-data text-[26px] font-extrabold text-ink">
                  {FOUNDING_500.pro.founding}
                  <span className="text-[15px] font-bold text-muted">/mo</span>
                </span>
                <span className="text-[13px] font-semibold text-molten">locked for life</span>
              </p>
              <p className="mt-0.5 text-[12.5px] text-muted">
                Regular price: <span className="line-through">{FOUNDING_500.pro.regular}/mo</span>
              </p>
              <ul className="mt-3 space-y-1.5">
                {PERKS.map((p) => (
                  <li key={p} className="flex items-center gap-2 text-[13px] text-ink">
                    <Check size={14} className="shrink-0 text-molten" aria-hidden />
                    {p}
                  </li>
                ))}
              </ul>
              <p className="font-data mt-3 text-[12px] font-semibold text-molten">
                Only {FOUNDING_500.spotsLeft} of {FOUNDING_500.total} spots left
              </p>
            </div>

            <div className="mt-4 space-y-3">
              <input
                type="text"
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
                placeholder="Full name"
                className={FIELD}
              />
              <input
                type="text"
                value={f.company}
                onChange={(e) => setF({ ...f, company: e.target.value })}
                placeholder="Company / startup"
                className={FIELD}
              />
              <input
                type="email"
                required
                value={f.email}
                onChange={(e) => setF({ ...f, email: e.target.value })}
                placeholder="you@company.com"
                className={FIELD}
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
              {sending ? "Locking…" : "Lock Founding 500 Pricing →"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-2 w-full py-1.5 text-center text-[13px] text-muted transition-colors hover:text-ink"
            >
              maybe later
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
