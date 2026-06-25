import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Anton, Archivo, DM_Mono } from "next/font/google";
import AppShell from "@/components/app/AppShell";
import { backendFetch } from "@/lib/server/backend";

const anton = Anton({ variable: "--font-anton", subsets: ["latin"], weight: "400" });
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});
const dmMono = DM_Mono({ variable: "--font-dmmono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { template: "%s — MRK18", default: "Console — MRK18" },
  robots: { index: false, follow: false },
};

/** The authenticated app shell: slim rail + full-height section content.
 *  Guard: a signed-in account with no workspace yet (new or erased) is sent to
 *  onboarding instead of every dashboard widget dead-ending on "no founder". */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  let status = 0;
  try {
    const res = await backendFetch("/me");
    status = res.status;
  } catch {
    status = 0; // backend unreachable → don't bounce; let the page degrade
  }
  if (status === 403) redirect("/cowork"); // 403 = signed in but no founder record
  return (
    <div
      className={`${anton.variable} ${archivo.variable} ${dmMono.variable} app-scope h-dvh overflow-hidden bg-bg text-ink`}
    >
      <AppShell>{children}</AppShell>
    </div>
  );
}
