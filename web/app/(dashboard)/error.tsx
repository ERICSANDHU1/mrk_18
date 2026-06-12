"use client";

import ErrorState from "@/components/dashboard/ErrorState";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg pt-16">
      <ErrorState
        title="This screen hit an error"
        body={
          error.digest
            ? `Something broke while rendering (ref ${error.digest}). Your data is untouched.`
            : "Something broke while rendering. Your data is untouched."
        }
        onRetry={reset}
      />
    </div>
  );
}
