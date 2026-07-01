import type { Metadata } from "next";
import {
  Sora,
  Space_Grotesk,
  JetBrains_Mono,
  Fraunces,
  Hanken_Grotesk,
  Source_Serif_4,
  Familjen_Grotesk,
} from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
// Clash Display (headlines) is self-hosted via @font-face in globals.css
// (/public/fonts/*) — next/font/local mis-compiles in this Next build.

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "800"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});
const jbMono = JetBrains_Mono({
  variable: "--font-jbmono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Landing page ("Warm sand" theme) — display serif + warm humanist body.
// Scoped to .theme-sand in globals.css so the dark console/dashboard is unaffected.
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-fraunces",
});
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-hanken",
});

// App pages (Chat / Comrk / Chief) — the Claude-like pairing: a warm bookish
// serif for greetings + CMO prose (≈Copernicus) and a friendly grotesk for the
// UI (≈Styrene). The real Claude fonts are proprietary; these are the closest
// open equivalents.
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
  variable: "--font-claude-serif",
});
const familjen = Familjen_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-claude-sans",
});

const description =
  "The marketing brain founders can't afford to hire — yet. mrk18 reads your real numbers, flags what's leaking money, and hands you the next move in plain language.";

export const metadata: Metadata = {
  title: "mrk18 — CMO in your pocket",
  description,
  metadataBase: new URL("https://mrk18.com"),
  openGraph: {
    title: "mrk18 — CMO in your pocket",
    description,
    url: "https://mrk18.com",
    siteName: "mrk18",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "mrk18 — CMO in your pocket" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "mrk18 — CMO in your pocket",
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#b4532a",
          colorBackground: "#ffffff",
          borderRadius: "0.6rem",
          fontFamily: "var(--font-hanken), system-ui, sans-serif",
        },
        elements: {
          card: "bg-surface border border-stroke-2 shadow-xl",
          headerTitle: "tracking-tight",
          socialButtonsBlockButton: "border-stroke-2",
          formButtonPrimary: "bg-molten text-white font-bold hover:opacity-90",
          footerActionLink: "text-molten hover:underline",
        },
      }}
    >
      <html
        lang="en"
        suppressHydrationWarning
        className={`${sora.variable} ${spaceGrotesk.variable} ${jbMono.variable} ${fraunces.variable} ${hanken.variable} ${sourceSerif.variable} ${familjen.variable} h-full antialiased`}
      >
        <body className="theme-sand min-h-full flex flex-col bg-bg text-ink">
          {/* no-flash: apply the saved Appearance (System/Light/Dark) before paint */}
          <script
            dangerouslySetInnerHTML={{
              __html:
                "(function(){try{var t=localStorage.getItem('mrk18-theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('mrk18-dark');}catch(e){}})();",
            }}
          />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
