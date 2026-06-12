"use client";

import Image from "next/image";
import { useState } from "react";
import { motion, useMotionValueEvent, useScroll } from "framer-motion";

const LINKS = [
  { label: "How it works", href: "#how" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
];

export default function Navbar() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 24));

  return (
    <motion.header
      initial={{ y: -32, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 2.15, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4"
    >
      <nav
        className={`glass flex w-full max-w-5xl items-center justify-between rounded-2xl px-5 py-3 transition-shadow duration-300 ${
          scrolled ? "shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-2xl" : ""
        }`}
      >
        <a href="#top" className="flex items-center gap-2.5" aria-label="mrk18 home">
          <Image src="/logo.svg" alt="mrk18 logo" width={30} height={23} priority />
          <span className="text-[17px] font-extrabold tracking-tight">mrk18</span>
        </a>

        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[13.5px] text-muted transition-colors duration-200 hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </div>

        <a
          href="#waitlist"
          className="relative overflow-hidden rounded-xl px-4 py-2 text-[13.5px] font-semibold text-[#0a0a0b] transition-transform duration-200 hover:scale-[1.03]"
          style={{ background: "var(--gradient-brand)" }}
        >
          Join the waitlist
        </a>
      </nav>
    </motion.header>
  );
}
