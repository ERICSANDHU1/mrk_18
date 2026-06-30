/** Shimmer placeholders shaped like the real content, so a *loading* screen
 *  never looks like an *empty* one. Backed by the `.skeleton` class in globals.css. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

/** A short stack of row-shaped skeletons (e.g. Recents list, table rows). */
export function SkeletonRows({ rows = 4, className = "" }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden className={`space-y-1.5 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full rounded-lg" />
      ))}
    </div>
  );
}
