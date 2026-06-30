/** Shared dashboard layout: centered, scrollable content. (The floating CMO is
 *  now mounted once in AppShell, so it's on every app page.) */
export default function DashboardFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full">
      <div className="dash-scroll h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-6">{children}</div>
      </div>
    </div>
  );
}
