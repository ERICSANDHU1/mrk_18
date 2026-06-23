"use client";

import Image from "next/image";
import { motion } from "framer-motion";

const LINKS = [
  { label: "How it works", href: "#how" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
];

export default function Navbar() {
  return (
    <motion.header
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4"
    >
      <nav className="feature-glass flex w-full max-w-5xl items-center justify-between rounded-2xl px-5 py-3">
        <a href="#top" className="flex items-center gap-2.5" aria-label="mrk18 home">
          <Image src="/logo-light.svg" alt="mrk18 logo" width={30} height={23} priority />
          <span className="text-[17px] font-extrabold tracking-tight text-[#1b1815]">mrk18</span>
        </a>

        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[13.5px] text-[#6b6357] transition-colors duration-200 hover:text-[#1b1815]"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <a
            href="/sign-in"
            className="hidden text-[13.5px] font-medium text-[#6b6357] transition-colors duration-200 hover:text-[#1b1815] sm:inline"
          >
            Sign in
          </a>
          <a
            href="/sign-up"
            className="relative overflow-hidden rounded-xl px-4 py-2 text-[13.5px] font-semibold text-white transition-transform duration-200 hover:scale-[1.03]"
            style={{ background: "#b4532a" }}
          >
            Get started
          </a>
        </div>
      </nav>
    </motion.header>
  );
}
