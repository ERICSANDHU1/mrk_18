import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { Check, Radar } from "lucide-react";
import Logo from "@/components/app/Logo";
import Wordmark from "@/components/app/Wordmark";
import AuthScene from "@/components/auth/AuthScene";
import Background3D from "@/components/Background3D";

export const metadata: Metadata = {
  title: { absolute: "mrk18 Sign in" },
  robots: { index: false, follow: false },
};

// The brand side is layered charcoal; the theme-aware Logo reads --ink/--surface,
// so hand it that palette explicitly (warm-white legs, charcoal slash gap).
const PANEL_LOGO_VARS = { "--ink": "#f5f3f0", "--surface": "#0d0c0b" } as React.CSSProperties;

// Charcoal melting into cream across the page — one soothing field, no seam.
const DISSOLVE =
  "linear-gradient(97deg, #0a0908 0%, #0c0b0a 36%, rgba(12,11,10,0.92) 46%, rgba(18,16,13,0.55) 57%, rgba(30,26,20,0.22) 66%, rgba(30,26,20,0) 76%)";
// The dark side's grid/constellation fades out together with the darkness.
const SCENE_MASK = "linear-gradient(90deg, #000 0%, #000 42%, transparent 70%)";

/** Auth threshold — one fixed screen, no page scroll. The whole page is a single
 *  canvas: black dissolving into cream, the landing's revolving 3D shapes
 *  floating across all of it. LEFT: the brand speaking (mono type, one
 *  bitter-truth exchange). RIGHT: each page's heading + the Clerk card
 *  (styled in ClerkThemed + the .auth-clerk rules in globals.css). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-bg">
      {/* ── the page-wide backdrop, painted in layers ── */}
      <div aria-hidden className="absolute inset-0 hidden lg:block" style={{ background: DISSOLVE }} />
      <div
        aria-hidden
        className="absolute inset-0 hidden lg:block"
        style={{ WebkitMaskImage: SCENE_MASK, maskImage: SCENE_MASK }}
      >
        <AuthScene />
      </div>
      {/* restrained warm glow over the cream side */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-44 right-[8%] h-96 w-96 rounded-full opacity-20 blur-[120px]"
        style={{ background: "var(--gradient-brand)" }}
      />
      {/* the landing's revolving 3D shapes, over the WHOLE page */}
      <Background3D className="pointer-events-none absolute inset-0" />

      {/* ── content ── */}
      <div className="relative z-10 grid h-full w-full lg:grid-cols-[1.08fr_1fr]">
        {/* brand side (desktop only) */}
        <aside className="relative hidden text-[#f5f3f0] lg:block">
          <div className="flex h-full flex-col justify-between p-10 xl:p-14">
            <Link
              href="/"
              aria-label="mrk18 home"
              className="auth-rise flex w-fit items-center gap-2.5"
              style={PANEL_LOGO_VARS}
            >
              <Logo size={26} className="shrink-0" />
              <Wordmark className="text-[17px] font-extrabold tracking-tight text-[#f5f3f0]" oxblood="#b23a3a" />
            </Link>

            <div className="max-w-md">
              <h1
                className="auth-rise font-display text-[clamp(2.5rem,2.8vw+1.2rem,3.6rem)] leading-[1.05] tracking-[-0.02em] text-[#d9d6d1] [text-wrap:balance]"
                style={{ animationDelay: "0.08s" }}
              >
                A CMO that tells you <em className="text-white">the truth.</em>
              </h1>
              <p
                className="auth-rise mt-5 max-w-sm text-[15px] leading-relaxed text-[#f5f3f0]/70"
                style={{ animationDelay: "0.18s" }}
              >
                mrk18 reads your real numbers, flags what&apos;s leaking money, and hands you the
                next move in plain language.
              </p>

              {/* a taste of the product — nobody asked anything: the CMO already
                  read the numbers and shows up with the fix drafted */}
              <div className="mt-9 max-w-sm">
                <p
                  className="auth-rise mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/50"
                  style={{ animationDelay: "0.5s" }}
                >
                  <span style={PANEL_LOGO_VARS} className="inline-flex">
                    <Logo size={14} />
                  </span>
                  your CMO · while you were away
                </p>
                {/* plain dark-messenger look — grey bubbles sized to their text,
                    no accent color in the thread */}
                <div className="flex flex-col items-start space-y-1.5">
                  <p
                    className="auth-rise w-fit rounded-2xl rounded-tl-md border border-white/10 bg-white/[0.07] px-4 py-2.5 text-[13.5px] leading-relaxed text-[#f5f3f0]/90 backdrop-blur-[2px]"
                    style={{ animationDelay: "0.6s" }}
                  >
                    Went through your numbers — two ad sets are burning budget and bringing nothing
                    back.
                  </p>
                  <div
                    className="auth-rise w-fit rounded-2xl rounded-tl-md border border-white/10 bg-white/[0.07] px-4 py-2.5 backdrop-blur-[2px]"
                    style={{ animationDelay: "1.05s" }}
                  >
                    <p className="text-[13.5px] leading-relaxed text-[#f5f3f0]/90">
                      The fix is already drafted: waste killed, budget moved to the two sets that
                      pay back.
                    </p>
                    <span
                      aria-hidden
                      className="pointer-events-none mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold text-[#f5f3f0]"
                    >
                      <Check size={12} strokeWidth={3} /> One tap to approve
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              {/* the device teaser — mrk is stepping out of the screen */}
              <div
                className="auth-rise mb-4 flex w-fit items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 backdrop-blur-[2px]"
                style={{ animationDelay: "0.4s" }}
              >
                <Radar size={15} className="shrink-0 text-white/70" aria-hidden />
                <span className="text-[12.5px] font-bold tracking-tight text-white">mrk</span>
                <span className="text-[12px] text-white/60">— the CMO in your pocket</span>
                <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-white/75">
                  Launching soon
                </span>
              </div>
              <div
                className="auth-rise flex items-center justify-between gap-3 text-[12px] text-white/55"
                style={{ animationDelay: "0.3s" }}
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden className="auth-pulse h-1.5 w-1.5 rounded-full bg-white" />
                  Your CMO is online
                </span>
                <span className="text-white/35">For founders everywhere</span>
              </div>
            </div>
          </div>
        </aside>

        {/* auth column — centers when it fits, scrolls inside itself only if the
            viewport is truly short (never the whole page) */}
        <section className="relative h-full overflow-hidden">
          <div className="dash-scroll relative z-10 h-full overflow-y-auto">
            <div className="mx-auto flex min-h-full w-full max-w-[440px] flex-col items-center justify-center px-4 py-6 sm:px-6">
              {/* the brand still says hello on mobile, where the panel is hidden */}
              <Link
                href="/"
                aria-label="mrk18 home"
                className="auth-rise mb-6 flex items-center gap-2.5 lg:hidden"
              >
                <Image src="/logo-light.svg" alt="mrk18 logo" width={17} height={26} priority />
                <Wordmark className="text-[17px] font-extrabold tracking-tight text-[#1b1815]" oxblood="#6b1a1a" />
              </Link>

              <div className="auth-clerk flex w-full flex-col items-center">{children}</div>

              <p
                className="auth-rise mt-5 max-w-[340px] text-center text-[11px] leading-relaxed text-muted/80"
                style={{ animationDelay: "0.35s" }}
              >
                By continuing you agree to our{" "}
                <Link href="/terms" className="font-medium text-[#b4532a] hover:underline">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="font-medium text-[#b4532a] hover:underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
