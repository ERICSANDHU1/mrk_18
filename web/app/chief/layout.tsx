import type { Metadata } from "next";
import { Anton, Archivo, DM_Mono } from "next/font/google";
import AppShell from "@/components/app/AppShell";
import { requireProAccess } from "@/lib/entitlements-server";

const anton = Anton({ variable: "--font-anton", subsets: ["latin"], weight: "400" });
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});
const dmMono = DM_Mono({ variable: "--font-dmmono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { absolute: "mrk18 Chief" },
  robots: { index: false, follow: false },
};

/** Chief shell — same rail + theme as the rest of the app. Founding-500 only:
 *  the gate runs before anything renders, so the URL can't be typed past. */
export default async function ChiefLayout({ children }: { children: React.ReactNode }) {
  await requireProAccess();
  return (
    <div
      className={`${anton.variable} ${archivo.variable} ${dmMono.variable} app-scope h-dvh overflow-hidden bg-bg text-ink`}
    >
      <AppShell>{children}</AppShell>
    </div>
  );
}
