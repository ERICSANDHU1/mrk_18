import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { template: "%s — mrk18", default: "Sign in — mrk18" },
  robots: { index: false, follow: false },
};

/** Centered, on-brand shell that frames Clerk's sign-in / sign-up card. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      {/* restrained brand glow, not decoration overload */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full opacity-25 blur-[120px]"
        style={{ background: "var(--gradient-brand)" }}
      />

      <Link href="/" className="z-10 mb-8 flex items-center gap-2.5" aria-label="mrk18 home">
        <Image src="/logo-light.svg" alt="mrk18 logo" width={30} height={23} priority />
        <span className="text-[17px] font-extrabold tracking-tight text-[#1b1815]">mrk18</span>
      </Link>

      <p className="z-10 mb-6 max-w-sm text-center text-[13px] leading-relaxed text-muted">
        The marketing brain founders can&apos;t afford to hire — yet. Sign in to meet your CMO.
      </p>

      <div className="z-10 flex w-full justify-center">{children}</div>

      <p className="z-10 mt-8 text-center text-[11px] text-muted/70">
        Secured authentication · your data stays yours.
      </p>
    </main>
  );
}
