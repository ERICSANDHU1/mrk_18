"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import Waitlist, { queuePosition } from "@/components/sections/Waitlist";

/** Top FOMO bar on the /mrk page — a live-feeling waitlist position + a button
 *  that opens the Founding-500 apply form RIGHT HERE (the modal is rendered on
 *  this page), so it never bounces the founder out to the landing. */
export default function MrkWaitlistCta() {
  const [pos, setPos] = useState(247); // stable SSR value; the real (climbing) one lands on mount
  useEffect(() => setPos(queuePosition()), []);

  const openForm = () => window.dispatchEvent(new Event("mrk18:open-waitlist"));

  return (
    <>
      <div className="mb-6 flex flex-col items-start justify-between gap-3 rounded-2xl border border-molten/25 bg-molten/[0.05] px-4 py-3.5 sm:flex-row sm:items-center">
        <div>
          <p className="flex items-center gap-2 text-[13px] font-bold text-ink">
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-molten opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-molten" />
            </span>
            You&apos;re #{pos} on the waitlist
          </p>
          <p className="mt-0.5 text-[12px] text-mute">
            Founder pricing locks for life — and the first pucks go to the Founding 500.
          </p>
        </div>
        <button
          onClick={openForm}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-molten px-4 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90"
        >
          Reserve a Founding 500 seat <ArrowRight size={14} aria-hidden />
        </button>
      </div>

      {/* the apply form itself — opens as a modal over this page on click */}
      <Waitlist />
    </>
  );
}
