import type { Metadata } from "next";
import { Anton, Archivo, DM_Mono } from "next/font/google";
import AppShell from "@/components/app/AppShell";

const anton = Anton({ variable: "--font-anton", subsets: ["latin"], weight: "400" });
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});
const dmMono = DM_Mono({ variable: "--font-dmmono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { absolute: "Set up your CMO" },
  robots: { index: false, follow: false },
};

/** Onboarding shell — same rail + theme as the rest of the app, so the form's
 *  "brain forming" right panel docks into AppShell's slot exactly like /cowork. */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${anton.variable} ${archivo.variable} ${dmMono.variable} app-scope h-dvh overflow-hidden bg-bg text-ink`}
    >
      <AppShell>{children}</AppShell>
    </div>
  );
}
