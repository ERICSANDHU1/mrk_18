"use client";

import { useId } from "react";

/** The mrk18 "M" mark — theme-aware. The ink legs follow `--ink` (dark on the
 *  light theme, light on the night theme); the slash gap follows `--surface` so
 *  the split reads cleanly on any surface; the diagonal keeps the brand orange.
 *  Used across the dashboard (.app-scope); the landing keeps /logo-light.svg. */
export default function Logo({
  width = 30,
  height = 23,
  className,
}: {
  width?: number;
  height?: number;
  className?: string;
}) {
  const gid = useId();
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 512 384"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="120" y1="40" x2="240" y2="300" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FF6A00" />
          <stop offset="0.6" stopColor="#FF5E08" />
          <stop offset="1" stopColor="#E0490E" />
        </linearGradient>
      </defs>
      {/* right diagonal + right leg — follows the theme ink */}
      <path d="M404 348 L404 36 L256 296 Z" style={{ fill: "var(--ink)" }} />
      <path d="M340 348 L404 36 L404 348 Z" style={{ fill: "var(--ink)" }} />
      <path d="M348 348 L404 240 L404 348 Z" style={{ fill: "var(--ink)" }} />
      {/* slash gap — matches the surface so the split reads on light AND dark */}
      <path
        d="M108 348 L108 64 L262 292"
        style={{ stroke: "var(--surface)" }}
        strokeWidth="104"
        strokeLinecap="butt"
        strokeLinejoin="miter"
        fill="none"
      />
      {/* left leg + diagonal — the brand orange */}
      <path
        d="M108 348 L108 64 L256 284"
        stroke={`url(#${gid})`}
        strokeWidth="72"
        strokeLinecap="butt"
        strokeLinejoin="miter"
        fill="none"
      />
    </svg>
  );
}
