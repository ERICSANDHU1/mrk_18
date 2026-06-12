import Link from "next/link";
import { Plug } from "lucide-react";

/** No data yet — point at the fix, don't apologise. */
export default function EmptyState({
  title = "No verdict yet",
  body = "Connect a data source and your CMO will deliver the first verdict within a day.",
  ctaLabel = "Connect a source",
  ctaHref = "/connections",
}: {
  title?: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stroke-2 bg-surface px-6 py-14 text-center">
      <span className="mb-4 rounded-xl border border-stroke-2 bg-surface-2 p-3 text-muted">
        <Plug size={20} aria-hidden />
      </span>
      <h3 className="text-[15px] font-bold tracking-tight">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{body}</p>
      <Link
        href={ctaHref}
        className="mt-5 rounded-lg bg-gradient-to-r from-molten via-amber to-ember px-4 py-2 text-[13px] font-bold text-black transition-opacity duration-200 hover:opacity-90"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
