"use client";

import { useRef } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

/** Primary CTA: magnetic pull toward the cursor + sheen sweep on hover. */
export default function MagneticButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 180, damping: 16, mass: 0.4 });
  const y = useSpring(my, { stiffness: 180, damping: 16, mass: 0.4 });

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    mx.set((e.clientX - (rect.left + rect.width / 2)) * 0.28);
    my.set((e.clientY - (rect.top + rect.height / 2)) * 0.28);
  };

  const onLeave = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ x, y }}
      className="inline-block"
    >
      <a
        href={href}
        className="group relative inline-flex items-center gap-2 overflow-hidden rounded-2xl px-7 py-4 text-[15px] font-semibold text-[color:var(--cta-ink,#0a0a0b)] shadow-[0_12px_44px_var(--cta-glow,rgba(255,106,0,0.35))] transition-shadow duration-300 hover:shadow-[0_16px_56px_var(--cta-glow-strong,rgba(255,106,0,0.5))] !cursor-default"
        style={{ background: "var(--gradient-brand)" }}
      >
        {/* sheen sweep */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-white/35 blur-md group-hover:[animation:sheen_0.9s_ease]"
          style={{ transform: "translateX(-130%) skewX(-18deg)" }}
        />
        {children}
      </a>
    </motion.div>
  );
}
