"use client";

import { useEffect, useState } from "react";
import { Check, Download, Loader2, Trash2 } from "lucide-react";
import { useClerk } from "@clerk/nextjs";
import Panel from "../Panel";

const FIELD =
  "w-full rounded-lg border border-stroke-2 bg-surface-2 px-3 py-2 text-[13px] text-ink placeholder:text-muted/60 focus:border-amber/40 focus:outline-none";
const LABEL = "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted";

export default function SettingsView() {
  const { signOut } = useClerk();

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [initial, setInitial] = useState({ name: "", website: "", description: "" });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);

  // Load the REAL workspace fields from the founder's profile.
  useEffect(() => {
    let active = true;
    fetch("/api/me/profile", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active) return;
        const n = d?.profile?.company_name ?? "";
        const w = d?.profile?.website ?? "";
        const desc = d?.profile?.product_description ?? "";
        setName(n);
        setWebsite(w);
        setDescription(desc);
        setInitial({ name: n, website: w, description: desc });
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const dirty =
    name.trim() !== initial.name ||
    website.trim() !== initial.website ||
    description.trim() !== initial.description;

  const save = async () => {
    setSaving(true);
    setSaveErr(null);
    setSaved(false);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: {
            company_name: name.trim(),
            website: website.trim(),
            product_description: description.trim(),
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = data?.detail;
        setSaveErr(
          typeof detail === "string" ? detail : detail?.message ?? "Couldn't save — try again.",
        );
      } else {
        setInitial({ name: name.trim(), website: website.trim(), description: description.trim() });
        setSaved(true);
        setTimeout(() => setSaved(false), 2200);
      }
    } catch {
      setSaveErr("Couldn't reach the server.");
    } finally {
      setSaving(false);
    }
  };

  const exportData = async () => {
    setExporting(true);
    setExportErr(null);
    try {
      const res = await fetch("/api/me/export", { cache: "no-store" });
      const text = await res.text();
      if (!res.ok) {
        let msg = `Couldn't export (${res.status}).`;
        try {
          const e = JSON.parse(text);
          if (e?.error) msg = `Couldn't export — ${e.error}${e.status ? ` (${e.status})` : ""}.`;
        } catch {
          /* keep generic message */
        }
        setExportErr(`${msg} If your backend was idle it may be waking up — try again in a few seconds.`);
        return;
      }
      // download the backend JSON verbatim
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mrk18-export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportErr("Couldn't reach the server.");
    } finally {
      setExporting(false);
    }
  };

  const del = async () => {
    setDeleting(true);
    setDelErr(null);
    try {
      const res = await fetch("/api/me", { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const detail = d?.detail ?? d?.error;
        setDelErr(
          typeof detail === "string" && detail
            ? `Couldn't delete — ${detail}`
            : "Couldn't delete — try again in a few seconds (the backend may be waking up).",
        );
        setDeleting(false);
        return;
      }
      await signOut();
      window.location.href = "/";
    } catch {
      setDelErr("Couldn't reach the server.");
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex max-w-3xl justify-center py-16">
        <Loader2 className="animate-spin text-muted" size={20} aria-hidden />
      </div>
    );
  }

  return (
    <div className="grid max-w-3xl gap-4">
      <Panel eyebrow="Workspace" title={name || "Your workspace"} delay={1}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ws-name" className={LABEL}>
              Workspace name
            </label>
            <input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} className={FIELD} />
          </div>
          <div>
            <label htmlFor="ws-site" className={LABEL}>
              Website
            </label>
            <input
              id="ws-site"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="yourbrand.com"
              className={FIELD}
            />
          </div>
        </div>
        <div className="mt-4">
          <label htmlFor="ws-desc" className={LABEL}>
            What your company does
          </label>
          <textarea
            id="ws-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="What you do, what makes you different, and the problem you solve…"
            className={`${FIELD} resize-y leading-relaxed`}
          />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Your CMO reads your website <em>and</em> this description to ground every analysis &amp; post —
          keep them accurate and complete.
        </p>
      </Panel>

      <Panel eyebrow="Your data" title="Yours, always" delay={2}>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={exportData}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-lg border border-stroke-2 px-3.5 py-2 text-[12px] font-semibold transition-colors duration-200 hover:bg-[var(--overlay-subtle)] disabled:opacity-50"
          >
            {exporting ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Download size={13} aria-hidden />}
            Export everything (JSON)
          </button>
          {!confirmDel ? (
            <button
              onClick={() => setConfirmDel(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-bad/25 px-3.5 py-2 text-[12px] font-semibold text-bad transition-colors duration-200 hover:bg-bad/10"
            >
              <Trash2 size={13} aria-hidden /> Delete workspace
            </button>
          ) : (
            <span className="inline-flex items-center gap-2">
              <button
                onClick={del}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-lg bg-bad px-3.5 py-2 text-[12px] font-bold text-white transition-opacity duration-200 hover:opacity-90 disabled:opacity-50"
              >
                {deleting && <Loader2 size={13} className="animate-spin" aria-hidden />} Yes, delete everything
              </button>
              <button
                onClick={() => setConfirmDel(false)}
                disabled={deleting}
                className="rounded-lg border border-stroke-2 px-3.5 py-2 text-[12px] font-semibold transition-colors duration-200 hover:bg-[var(--overlay-subtle)]"
              >
                Cancel
              </button>
            </span>
          )}
        </div>
        {exportErr && <p className="mt-2 text-[12px] font-semibold text-bad">{exportErr}</p>}
        {delErr && <p className="mt-2 text-[12px] font-semibold text-bad">{delErr}</p>}
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Export gives you everything we hold about you (your right to access). Deleting erases all your
          data immediately and signs you out — this can&apos;t be undone.
        </p>
      </Panel>

      <Panel eyebrow="Coming soon" title="More controls on the way" delay={3}>
        <p className="text-[12px] leading-relaxed text-muted">
          CMO voice &amp; tone, notification preferences (leak alerts, weekly report) and currency &amp;
          timezone are coming soon — they unlock alongside the live data connectors.
        </p>
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-molten via-amber to-ember px-5 py-2.5 text-[13px] font-bold text-white transition-opacity duration-200 hover:opacity-90 disabled:opacity-50"
        >
          {saving && <Loader2 size={13} className="animate-spin" aria-hidden />} Save changes
        </button>
        <span
          aria-live="polite"
          className={`inline-flex items-center gap-1.5 text-[12px] font-semibold text-good transition-opacity duration-300 ${
            saved ? "opacity-100" : "opacity-0"
          }`}
        >
          <Check size={13} aria-hidden /> Saved
        </span>
        {saveErr && <span className="text-[12px] font-semibold text-bad">{saveErr}</span>}
      </div>
    </div>
  );
}
