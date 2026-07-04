"use client";

import { useEffect, useRef } from "react";
import { animate, useInView } from "framer-motion";

/** Animated counter: counts `value` from 0 (ease-out) when scrolled into view. */
export default function Stat({
  value,
  prefix = "",
  suffix = "",
  label,
  border = true,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  label: string;
  border?: boolean;
}) {
  const numRef = useRef<HTMLSpanElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  useEffect(() => {
    if (!inView || !numRef.current) return;
    const node = numRef.current;
    const controls = animate(0, value, {
      duration: 1.4,
      ease: "easeOut",
      onUpdate: (v) => {
        node.textContent = `${prefix}${Math.round(v)}${suffix}`;
      },
    });
    return () => controls.stop();
  }, [inView, value, prefix, suffix]);

  return (
    <div ref={ref} className={border ? "gradient-border-l pl-4" : ""}>
      <span ref={numRef} className="block text-3xl font-extrabold tracking-tight md:text-4xl">
        {prefix}0{suffix}
      </span>
      {/* font-medium: the body's global weight-300 made these captions look fainter than their color */}
      <span className="mt-1 block text-[13px] font-medium leading-snug text-muted">{label}</span>
    </div>
  );
}
