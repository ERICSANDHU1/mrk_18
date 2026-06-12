/** Shimmer primitives + per-route page skeletons (used by loading.tsx files). */

export function Sk({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

function SkPanel({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`rounded-2xl border border-stroke-2 bg-surface p-5 ${className}`}>
      <Sk className="mb-4 h-3 w-24" />
      {Array.from({ length: lines }).map((_, i) => (
        <Sk key={i} className={`mb-2.5 h-4 ${i % 3 === 0 ? "w-3/4" : i % 3 === 1 ? "w-full" : "w-1/2"}`} />
      ))}
    </div>
  );
}

export default function PageSkeleton({
  variant = "cards",
}: {
  variant?: "home" | "table" | "cards" | "doc" | "board";
}) {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-4">
      <span className="sr-only">Loading…</span>
      {variant === "home" && (
        <>
          <div className="rounded-2xl border border-stroke-2 bg-surface p-6">
            <Sk className="mb-3 h-3 w-40" />
            <Sk className="h-7 w-3/4" />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <SkPanel lines={4} />
            <SkPanel lines={4} />
            <SkPanel lines={4} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkPanel key={i} lines={2} />
            ))}
          </div>
        </>
      )}
      {variant === "table" && (
        <>
          <SkPanel lines={1} />
          <div className="rounded-2xl border border-stroke-2 bg-surface p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Sk key={i} className="mb-3 h-10 w-full" />
            ))}
          </div>
        </>
      )}
      {variant === "cards" && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkPanel key={i} lines={4} />
          ))}
        </div>
      )}
      {variant === "doc" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <div className="space-y-4">
            <SkPanel lines={2} />
            <SkPanel lines={6} />
            <SkPanel lines={6} />
          </div>
          <SkPanel lines={8} />
        </div>
      )}
      {variant === "board" && (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkPanel key={i} lines={7} />
          ))}
        </div>
      )}
    </div>
  );
}
