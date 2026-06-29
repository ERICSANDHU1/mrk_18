import CmoPanel from "../CmoPanel";

/** Shared dashboard layout: centered, scrollable content + the floating CMO
 *  button. The old sub-nav is gone — analytics are reached from Chief, and
 *  Settings lives by the profile in the main rail. */
export default function DashboardFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full">
      <div className="dash-scroll h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-6">{children}</div>
      </div>
      <CmoPanel />
    </div>
  );
}
