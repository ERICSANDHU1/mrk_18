"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Lock, RefreshCw } from "lucide-react";
import { CONNECTORS_LOCKED } from "@/lib/flags";

type Conn = {
  platform: string;
  status: string;
  external_ref: string | null;
  needs_reconnect: boolean;
};

/** "Connect Meta Ads" → redirects the founder to their OWN Meta account to
 *  approve ads_read (the authorize_url from the backend). Once connected, shows
 *  the linked ad account + a manual "Refresh data" that re-pulls insights. */
export default function ConnectMetaButton() {
  const [conns, setConns] = useState<Conn[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/connections", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => active && setConns(Array.isArray(d) ? d : []))
      .catch(() => active && setConns([]));
    return () => {
      active = false;
    };
  }, []);

  if (CONNECTORS_LOCKED) {
    return (
      <span className="inline-flex items-center gap-2 rounded-lg border border-stroke-2 bg-surface-2 px-3.5 py-2 text-[12.5px] font-semibold text-muted">
        <Lock size={14} aria-hidden /> Meta connector — coming soon
      </span>
    );
  }

  const meta = conns?.find((c) => c.platform === "meta" && c.status === "connected") ?? null;

  const connect = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/connections/meta/start", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.authorize_url) {
        setErr(
          res.status === 503
            ? "Meta connector is being set up — check back shortly."
            : data?.error || "Couldn't start the connection.",
        );
        setBusy(false);
        return;
      }
      window.location.href = data.authorize_url; // → the founder's own Meta login + consent
    } catch {
      setErr("Couldn't reach the server.");
      setBusy(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/analytics/sync-meta", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSyncMsg("Synced — refreshing…");
        setTimeout(() => window.location.reload(), 900);
      } else {
        setSyncMsg(data?.error || "Sync failed — try again.");
        setSyncing(false);
      }
    } catch {
      setSyncMsg("Couldn't reach the server.");
      setSyncing(false);
    }
  };

  if (meta) {
    return (
      <div className="inline-flex flex-col items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-lg border border-good/30 bg-good/10 px-3.5 py-2 text-[12.5px] font-semibold text-good">
          <Check size={14} aria-hidden /> Meta connected{meta.external_ref ? ` · ${meta.external_ref}` : ""}
        </span>
        <button
          onClick={sync}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted transition-colors hover:text-ink disabled:opacity-50"
        >
          {syncing ? (
            <Loader2 size={12} className="animate-spin" aria-hidden />
          ) : (
            <RefreshCw size={12} aria-hidden />
          )}
          Refresh data
        </button>
        {syncMsg && <span className="text-[11px] text-muted">{syncMsg}</span>}
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col items-center gap-2">
      <button
        onClick={connect}
        disabled={busy || conns === null}
        className="inline-flex items-center gap-2 rounded-lg bg-molten px-4 py-2.5 text-[13px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}
        Connect Meta Ads
      </button>
      {err && <span className="max-w-xs text-[11px] leading-relaxed text-bad">{err}</span>}
    </div>
  );
}
