"use client";

import { useEffect, useRef } from "react";

// Tuning knobs — the approved Section-01 visual language: faint grid, a slow
// molten light sweep, a sparse drifting node constellation, dark vignette.
const GRID = 56; // px between grid lines
const NODE_AREA = 42000; // px² per node — density scales with panel size
const NODE_MAX = 22;
const LINK_DIST = 170; // px — nodes closer than this get a hairline link
const SWEEP_MS = 16000; // one diagonal light pass

type Node = { x: number; y: number; vx: number; vy: number; r: number };

/** Ambient Canvas-2D scene behind the auth brand panel. Pure decoration:
 *  aria-hidden, one static frame under prefers-reduced-motion, paused while
 *  the tab is hidden. */
export default function AuthScene() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let w = 0;
    let h = 0;
    let nodes: Node[] = [];

    const seed = () => {
      const count = Math.min(NODE_MAX, Math.max(10, Math.round((w * h) / NODE_AREA)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.1,
        vy: (Math.random() - 0.5) * 0.1,
        r: 1 + Math.random() * 1.6,
      }));
    };

    const size = () => {
      const b = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = b.width;
      h = b.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);

      // grid — neutral hairlines, barely there
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = (w % GRID) / 2; x <= w; x += GRID) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = (h % GRID) / 2; y <= h; y += GRID) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      // moonlight sweep — soft silver light drifting corner-to-corner
      const p = (t % SWEEP_MS) / SWEEP_MS;
      const cx = -w * 0.3 + p * (w * 1.6);
      const cy = h * 0.9 - p * (h * 0.8);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.55);
      g.addColorStop(0, "rgba(228, 226, 222, 0.11)");
      g.addColorStop(0.45, "rgba(255, 255, 255, 0.035)");
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // nodes drift and bounce softly; near pairs get a hairline link
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < LINK_DIST) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${(1 - d / LINK_DIST) * 0.09})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // vignette keeps the copy zone calm
      const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.78);
      v.addColorStop(0, "rgba(0, 0, 0, 0)");
      v.addColorStop(1, "rgba(6, 6, 6, 0.5)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
    };

    const loop = (t: number) => {
      draw(t);
      raf = requestAnimationFrame(loop);
    };

    size();
    const ro = new ResizeObserver(size);
    ro.observe(canvas);

    if (reduced) draw(SWEEP_MS * 0.3);
    else raf = requestAnimationFrame(loop);

    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduced) raf = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="absolute inset-0 h-full w-full" />;
}
