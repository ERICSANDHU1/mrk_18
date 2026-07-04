import Image from "next/image";
import Link from "next/link";
import MagneticButton from "../ui/MagneticButton";
import FoundersPopover from "./FoundersPopover";
import Wordmark from "@/components/app/Wordmark";

const EXPLORE = [
  { label: "How it works", href: "#how" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "Back to top", href: "#top" },
];

const CONNECT = [
  { label: "mrk18ai@gmail.com", href: "mailto:mrk18ai@gmail.com", external: false },
  { label: "LinkedIn — mrk ai", href: "https://www.linkedin.com/in/mrk-ai-4a78a9409", external: true },
];

export default function Footer() {
  return (
    <footer className="relative overflow-hidden px-6 pt-16 pb-10">
      {/* closing CTA card */}
      <div className="mx-auto max-w-6xl">
        <div className="glass rounded-3xl px-8 py-12 shadow-[0_24px_70px_rgba(180,83,42,0.12)] md:px-12 md:py-14">
          <div className="flex flex-col items-center gap-8 text-center md:flex-row md:items-end md:justify-between md:text-left">
            <div>
              <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.3em] text-muted">
                Last call
              </span>
              <h2 className="mt-4 text-[clamp(1.9rem,4.5vw,3.1rem)] leading-[1.08]">
                Your CMO is almost <span className="text-gradient">in your pocket.</span>
              </h2>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
                Just 500 founder seats — locked-in pricing for life. Built to tell you the bitter
                truth — get in before the seats are gone.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-5">
              <MagneticButton href="/sign-up">Get started →</MagneticButton>
              <FoundersPopover />
            </div>
          </div>
        </div>
      </div>

      {/* brand + nav grid */}
      <div className="mx-auto mt-16 grid max-w-6xl grid-cols-1 gap-12 md:grid-cols-[1.6fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <Image src="/logo-light.svg" alt="mrk18 logo" width={17} height={26} />
            <Wordmark className="text-[17px] font-extrabold tracking-tight text-[#1b1815]" />
          </div>
          <p className="mt-6 max-w-xs text-[15px] leading-snug text-[#1b1815]">
            The marketing brain founders can&apos;t afford to hire —{" "}
            <span className="italic" style={{ fontFamily: "var(--font-claude-serif), Georgia, serif" }}>
              yet.
            </span>
          </p>
          <p className="mt-3 text-[13px] text-muted">Built for founders everywhere. Tells the bitter truth.</p>
        </div>

        <div>
          <h3 className="mb-5 font-mono text-[12px] font-semibold uppercase tracking-[0.3em] text-muted">
            Explore
          </h3>
          <ul className="flex flex-col gap-3.5">
            {EXPLORE.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  className="inline-block text-[14.5px] text-muted transition duration-200 hover:translate-x-1 hover:text-[#1b1815]"
                >
                  {l.label}
                </a>
              </li>
            ))}
            <li>
              <Link
                href="/sign-up"
                className="inline-block text-[14.5px] font-semibold text-amber transition duration-200 hover:translate-x-1 hover:opacity-80"
              >
                Get started
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="mb-5 font-mono text-[12px] font-semibold uppercase tracking-[0.3em] text-muted">
            Connect
          </h3>
          <ul className="flex flex-col gap-3.5">
            {CONNECT.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  target={l.external ? "_blank" : undefined}
                  rel={l.external ? "noopener noreferrer" : undefined}
                  className="inline-block text-[14.5px] text-muted transition duration-200 hover:translate-x-1 hover:text-[#1b1815]"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>


      {/* legal bar */}
      <div className="relative z-10 mx-auto mt-10 flex max-w-6xl flex-col gap-4 border-t border-stroke pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-muted">
          © 2026 mrk18 <span className="text-amber">·</span> CMO in your pocket
        </p>
        <div className="flex items-center gap-6">
          <Link href="/privacy" className="text-[13px] text-muted transition-colors hover:text-[#1b1815]">
            Privacy
          </Link>
          <Link href="/terms" className="text-[13px] text-muted transition-colors hover:text-[#1b1815]">
            Terms
          </Link>
          <a
            href="mailto:mrk18ai@gmail.com"
            className="text-[13px] text-muted transition-colors hover:text-[#1b1815]"
          >
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
