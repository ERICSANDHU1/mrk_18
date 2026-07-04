import type { Metadata } from "next";
import { Anton, Archivo, DM_Mono } from "next/font/google";
import AppShell from "@/components/app/AppShell";
import CmoPanel from "@/components/app/CmoPanel";

const anton = Anton({ variable: "--font-anton", subsets: ["latin"], weight: "400" });
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});
const dmMono = DM_Mono({ variable: "--font-dmmono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { absolute: "mrk18 Comrk" },
  robots: { index: false, follow: false },
};

/** Cowork shell — same rail as the rest of the app, full-height section content. */
export default function CoworkLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${anton.variable} ${archivo.variable} ${dmMono.variable} app-scope h-dvh overflow-hidden bg-bg text-ink`}
    >
      <AppShell>{children}</AppShell>
      <CmoPanel />
    </div>
  );
}
