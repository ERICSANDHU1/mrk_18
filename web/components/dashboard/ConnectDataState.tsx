import { Plug } from "lucide-react";

/** Tier-2 analytics screens (Leaks/Channels/Funnel) are real only once the
 * founder connects their marketing tools. Until the data connectors ship, show
 * this honest state — never invented numbers. */
export default function ConnectDataState({
  metric = "This view",
  sources = "GA4, your ad accounts & Stripe",
}: {
  metric?: string;
  sources?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stroke-2 bg-surface px-6 py-16 text-center">
      <span className="mb-4 rounded-xl border border-stroke-2 bg-surface-2 p-3 text-muted">
        <Plug size={20} aria-hidden />
      </span>
      <h3 className="text-[15px] font-bold tracking-tight">Connect your marketing data</h3>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted">
        {metric} comes straight from your real numbers — the moment you connect {sources}.
        Until then there&apos;s nothing here, and we won&apos;t invent figures.
      </p>
      <span className="mt-5 inline-flex items-center gap-2 rounded-lg border border-stroke-2 bg-surface-2 px-4 py-2 text-[12.5px] font-semibold text-muted">
        Data connectors — coming soon
      </span>
    </div>
  );
}
