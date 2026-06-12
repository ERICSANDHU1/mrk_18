import type { Metadata } from "next";
import { Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "800"],
});

const description =
  "The marketing brain founders can't afford to hire — yet. mrk18 reads your real numbers, flags what's leaking money, and hands you the next move in plain language.";

export const metadata: Metadata = {
  title: "mrk18 — your AI CMO",
  description,
  metadataBase: new URL("https://mrk18.com"),
  openGraph: {
    title: "mrk18 — your AI CMO",
    description,
    url: "https://mrk18.com",
    siteName: "mrk18",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "mrk18 — your AI CMO" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "mrk18 — your AI CMO",
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sora.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg text-ink">{children}</body>
    </html>
  );
}
