import { Plug } from "lucide-react";
import ConnectMetaButton from "./ConnectMetaButton";

/** Tier-2 analytics screens (Leaks/Channels/Funnel) are real only once the
 * founder connects their marketing tools. Shows the live "Connect Meta Ads"
 * action — never invented numbers until real data is connected. */
export default function ConnectDataState({ metric = "This view" }: { metric?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stroke-2 bg-surface px-6 py-16 text-center">
      <span className="mb-4 rounded-xl border border-stroke-2 bg-surface-2 p-3 text-muted">
        <Plug size={20} aria-hidden />
      </span>
      <h3 className="text-[15px] font-bold tracking-tight">Connect your marketing data</h3>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted">
        {metric} comes straight from your real numbers — connect your Meta ad account and your CMO
        diagnoses it in seconds. We never invent figures.
      </p>
      <div className="mt-5">
        <ConnectMetaButton />
      </div>
      <p className="mt-4 text-[11px] text-muted">GA4 &amp; Stripe connectors coming soon.</p>
    </div>
  );
}
