import Link from "next/link";
import { ArrowRight, Brain } from "lucide-react";
import { beliefs, retrain } from "@/lib/mock/console";

/** Brain mini — the live commands, with the full editable brain a click away in Cowork. */
export default function BrainMini() {
  const commands = beliefs.filter((b) => b.layer === "commands");
  return (
    <section id="brain" className="scroll-mt-4">
      <div className="rounded-xl border border-line bg-surface p-4">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
            <Brain size={16} className="text-molten" aria-hidden /> The Brain
          </h2>
          <span className="font-data rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-mute">
            retrain in {retrain.daysLeft}d · {retrain.signalsFolded} signals
          </span>
        </header>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-mute-2">
          What it&apos;s commanding right now
        </p>
        <ul className="space-y-2">
          {commands.map((b) => (
            <li key={b.id} className="flex gap-2.5 text-[13px] leading-relaxed text-ink/90">
              <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-molten" />
              {b.text}
            </li>
          ))}
        </ul>
        <Link
          href="/cowork"
          className="mt-3.5 inline-flex items-center gap-1.5 text-[12px] font-bold text-amber transition-opacity duration-200 hover:opacity-80"
        >
          Edit beliefs in Cowork
          <ArrowRight size={13} aria-hidden />
        </Link>
      </div>
    </section>
  );
}
