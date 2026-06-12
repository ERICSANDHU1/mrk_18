import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import Shell from "@/components/dashboard/Shell";

const mono = JetBrains_Mono({
  variable: "--font-jbmono",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: {
    template: "%s — mrk18",
    default: "Dashboard — mrk18",
  },
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${mono.variable} w-full`}>
      <Shell>{children}</Shell>
    </div>
  );
}
