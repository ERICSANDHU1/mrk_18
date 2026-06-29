"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

/** Kicks off a real analysis run, then routes to the run flow. */
export default function StartRunButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const start = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/runs", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.run_id) {
        window.dispatchEvent(new Event("mrk18:runs-changed")); // refresh the Comrk Recents
        router.push(`/cowork/run/${body.run_id}`);
        return;
      }
      setErr(body.error || "Couldn't start the run.");
    } catch {
      setErr("Couldn't reach the server. Is the backend running?");
    }
    setLoading(false);
  };

  return (
    <div className="mt-4">
      <button
        onClick={start}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-molten via-amber to-ember px-4 py-2 text-[12px] font-bold text-white transition-opacity duration-200 hover:opacity-90 disabled:opacity-70"
      >
        {loading ? (
          <>
            <Loader2 size={13} className="animate-spin" aria-hidden /> Starting…
          </>
        ) : (
          <>
            Start your first run <ArrowRight size={13} aria-hidden />
          </>
        )}
      </button>
      {err && <p className="mt-2 text-[12px] text-ember">{err}</p>}
    </div>
  );
}
