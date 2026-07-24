"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { UserButton, useUser } from "@clerk/nextjs";
import ThemeToggle from "@/components/app/ThemeToggle";
import Wordmark from "@/components/app/Wordmark";

const LINKS = [
  { label: "How it works", href: "#how" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
];

/** `subpage` = rendered off the landing (e.g. /terms, /privacy): the in-page
 *  anchors become absolute `/#…` so they navigate home first, and the logo
 *  goes to `/` instead of the (non-existent) `#top` anchor. */
export default function Navbar({
  subpage = false,
  appearance = false,
  unlock = false,
}: {
  subpage?: boolean;
  /** Show the Appearance switcher in the pill. On for the free taster, where
   *  there is no app rail to host it — floating it over the page collided with
   *  the verdict panels. */
  appearance?: boolean;
  /** Taster verdict page: strip the marketing nav (links + sign-in + get-started)
   *  down to a single "Unlock the full CMO" CTA, so the top bar is just the one
   *  action that matters there. Opens the Founding-500 modal via the shared
   *  event (the page already mounts <Waitlist/>). */
  unlock?: boolean;
}) {
  const base = subpage ? "/" : "";
  const { isSignedIn, isLoaded } = useUser();
  return (
    <motion.header
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4"
    >
      <nav className="feature-glass flex w-full max-w-5xl items-center justify-between rounded-2xl px-5 py-3">
        <a href={subpage ? "/" : "#top"} className="flex items-center gap-2.5" aria-label="mrk18 home">
          <Image
            src="/logo-light.svg"
            alt="mrk18 logo"
            width={17}
            height={26}
            priority
            className="logo-on-light"
          />
          <Image
            src="/logo.svg"
            alt=""
            aria-hidden
            width={17}
            height={26}
            className="logo-on-dark"
          />
          <Wordmark className="text-[17px] font-extrabold tracking-tight text-ink" />
        </a>

        {!unlock && (
          <div className="hidden items-center gap-7 md:flex">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={`${base}${l.href}`}
                className="text-[13.5px] text-muted transition-colors duration-200 hover:text-ink"
              >
                {l.label}
              </a>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          {appearance && <ThemeToggle />}
          {/* auth-aware: reflects whether you're actually signed in. Gated on
              isLoaded so the wrong state never flashes before Clerk resolves. */}
          {isLoaded &&
            (isSignedIn ? (
              <>
                <a
                  href="/chat"
                  className="relative overflow-hidden rounded-xl px-4 py-2 text-[13.5px] font-semibold text-[color:var(--cta-ink,#fff)] transition-transform duration-200 hover:scale-[1.03]"
                  style={{ background: "var(--gradient-brand, #b4532a)" }}
                >
                  Go to app →
                </a>
                <UserButton
                  appearance={{ elements: { avatarBox: "h-8 w-8 rounded-lg border border-line" } }}
                />
              </>
            ) : (
              <>
                <a
                  href="/sign-in"
                  className="text-[13.5px] font-medium text-muted transition-colors duration-200 hover:text-ink"
                >
                  Sign in
                </a>
                {!unlock && (
                  <a
                    href="/sign-up"
                    className="relative overflow-hidden rounded-xl px-4 py-2 text-[13.5px] font-semibold text-[color:var(--cta-ink,#fff)] transition-transform duration-200 hover:scale-[1.03]"
                    style={{ background: "var(--gradient-brand, #b4532a)" }}
                  >
                    Get started
                  </a>
                )}
              </>
            ))}
        </div>
      </nav>
    </motion.header>
  );
}
