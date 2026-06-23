import SubNav from "./SubNav";
import CmoPanel from "../CmoPanel";

/** Shared dashboard layout: sub-nav · scrollable content. The CMO is a floating
 *  MRK18 button (fixed-position) that opens its panel on click — no longer a column. */
export default function DashboardFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full">
      <div className="hidden w-[190px] shrink-0 lg:block">
        <SubNav />
      </div>
      <div className="dash-scroll flex-1 space-y-6 overflow-y-auto p-5">{children}</div>
      <CmoPanel />
    </div>
  );
}
