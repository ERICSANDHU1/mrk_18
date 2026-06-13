"use client";

import { useEffect, useRef, type ReactNode } from "react";

/* ---------------------------------------------------------------------------
   HeroBackground — Canvas-2D B2B hero background (no WebGL).
   Layers, back to front: near-black fill → faint grid → dim decorative
   node-web (texture) → diagonal orange light sweep → 4 bright labeled focus
   nodes in a diamond → radial vignette. The sweep brightens any node it
   crosses (focus nodes + their labels brighten most). Hero copy goes in the
   {children} layer above.

   Usage:
     <HeroBackground
       className="flex min-h-screen items-center"
       nodes={["STRATEGY", "CONTENT", "CAMPAIGNS", "ANALYTICS"]}  // [top,right,bottom,left]
     >
       <div className="mx-auto max-w-6xl px-6">
         <div className="md:w-1/2">…headline + CTA…</div>
       </div>
     </HeroBackground>
--------------------------------------------------------------------------- */

/* ---- TUNING CONSTANTS (safe to tweak) ----------------------------------- */
const GRID_CELL = 60; // px between grid lines
const GRID_LINE_WIDTH = 0.5;
const GRID_ALPHA = 0.5; // grid lines are already very dark

const SWEEP_DURATION = 7000; // ms per left→right pass (lower = faster sweep)
const SWEEP_BAND_WIDTH = 340; // px width of the soft light band
const SWEEP_SKEW_DEG = 12; // band tilt from vertical
const SWEEP_ALPHA = 0.16; // peak band opacity
const SWEEP_FALLOFF = 130; // px — how near the sweep must pass to light a node

const BG_NODE_COUNT = 15; // decorative web nodes (desktop) — 12–18
const BG_NODE_COUNT_MOBILE = 7; // thinned on small/low-end (6–8)
const BG_NODE_LINKS = 2; // nearest neighbours each bg node links to

const FG_CENTER_X = 0.68; // focus-diamond centre, fraction of width (right-center third)
const FG_CENTER_Y = 0.5;
const FG_CENTER_X_MOBILE = 0.5;
const FG_CENTER_Y_MOBILE = 0.64; // drop the cluster below the mobile copy
const FG_RADIUS_X = 0.30; // diamond half-width  (× min(canvasW, canvasH))
const FG_RADIUS_Y = 0.35; // diamond half-height (× min(canvasW, canvasH))
const FG_RING = 22; // outer radius of each node's soft orange ring
const FG_DOT = 3.4; // gold dot radius

const PULSE_RATE = 1.1; // focus-dot pulse speed (rad/s)
const PULSE_AMP = 0.16;
const TRAVEL_SPEED = 0.16; // connector traveling-highlight loops per second

const MOBILE_BREAKPOINT = 768; // below this width → static, thinned fallback
const MAX_DPR = 2; // cap devicePixelRatio for mid-range phones
/* ------------------------------------------------------------------------- */

const COLORS = {
  bg: "#0A0A0B",
  grid: "#1D1B18",
  bgNode: "#3a352d",
  bgEdge: "#26211b",
  molten: "255,106,0", // #FF6A00 (rgb for rgba())
  amber: "255,158,44", // #FF9E2C
  gold: "242,200,121", // #F2C879
  ink: "244,241,236", // #F4F1EC
};

const LABEL_FONT = '12px "DM Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, monospace';
const DEFAULT_NODES = ["STRATEGY", "CONTENT", "CAMPAIGNS", "ANALYTICS"];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type BgNode = { x: number; y: number; r: number; phase: number; speed: number };
type FgNode = {
  x: number;
  y: number;
  label: string;
  lx: number;
  ly: number;
  align: CanvasTextAlign;
  baseline: CanvasTextBaseline;
  phase: number;
};
type Edge = { a: number; b: number; offset: number };

export default function HeroBackground({
  children,
  className = "",
  nodes = DEFAULT_NODES,
}: {
  children?: ReactNode;
  className?: string;
  nodes?: string[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labels = (nodes && nodes.length >= 4 ? nodes : DEFAULT_NODES).slice(0, 4);
  const labelKey = labels.join("|");

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const skewRad = (SWEEP_SKEW_DEG * Math.PI) / 180;
    const cosSkew = Math.cos(skewRad);
    const sinSkew = Math.sin(skewRad);
    const base = document.createElement("canvas"); // cached bg + grid
    const TAU = Math.PI * 2;

    let raf = 0;
    let startTs = 0;
    let cssW = 1;
    let cssH = 1;
    let dpr = 1;
    let staticMode = false; // reduced-motion OR small viewport → no sweep/pulse
    let isMobile = false;
    let visible = true;
    let disposed = false;

    let bgNodes: BgNode[] = [];
    let bgEdges: Edge[] = [];
    let fgNodes: FgNode[] = [];
    let fgEdges: Edge[] = [];

    /* bg fill + faint grid — redrawn only on resize */
    const buildBase = () => {
      base.width = Math.max(1, Math.floor(cssW * dpr));
      base.height = Math.max(1, Math.floor(cssH * dpr));
      const b = base.getContext("2d");
      if (!b) return;
      b.setTransform(dpr, 0, 0, dpr, 0, 0);
      b.fillStyle = COLORS.bg;
      b.fillRect(0, 0, cssW, cssH);
      b.globalAlpha = GRID_ALPHA;
      b.strokeStyle = COLORS.grid;
      b.lineWidth = GRID_LINE_WIDTH;
      b.beginPath();
      for (let x = 0; x <= cssW; x += GRID_CELL) {
        b.moveTo(Math.round(x) + 0.5, 0);
        b.lineTo(Math.round(x) + 0.5, cssH);
      }
      for (let y = 0; y <= cssH; y += GRID_CELL) {
        b.moveTo(0, Math.round(y) + 0.5);
        b.lineTo(cssW, Math.round(y) + 0.5);
      }
      b.stroke();
      b.globalAlpha = 1;
    };

    /* decorative web across the WHOLE canvas (stratified scatter + nearest links) */
    const layoutBg = () => {
      const count = isMobile ? BG_NODE_COUNT_MOBILE : BG_NODE_COUNT;
      const cols = Math.max(2, Math.round(Math.sqrt(count * (cssW / cssH))));
      const rows = Math.max(2, Math.round(count / cols));
      const cw = cssW / cols;
      const ch = cssH / rows;
      const rng = mulberry32(7);
      bgNodes = [];
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          bgNodes.push({
            x: (gx + 0.2 + rng() * 0.6) * cw,
            y: (gy + 0.2 + rng() * 0.6) * ch,
            r: 1.2 + rng() * 1.5,
            phase: rng() * TAU,
            speed: 0.2 + rng() * 0.3,
          });
        }
      }
      bgEdges = [];
      const seen = new Set<number>();
      for (let i = 0; i < bgNodes.length; i++) {
        const dists: [number, number][] = [];
        for (let j = 0; j < bgNodes.length; j++) {
          if (j === i) continue;
          const dx = bgNodes[i].x - bgNodes[j].x;
          const dy = bgNodes[i].y - bgNodes[j].y;
          dists.push([dx * dx + dy * dy, j]);
        }
        dists.sort((a, b) => a[0] - b[0]);
        for (let m = 0; m < Math.min(BG_NODE_LINKS, dists.length); m++) {
          const j = dists[m][1];
          const a = Math.min(i, j);
          const b = Math.max(i, j);
          const key = a * 100000 + b;
          if (seen.has(key)) continue;
          seen.add(key);
          bgEdges.push({ a, b, offset: 0 });
        }
      }
    };

    /* the 4 focus nodes as a diamond in the right-center, labels placed outboard */
    const layoutFg = () => {
      const minDim = Math.min(cssW, cssH);
      const cy = cssH * (isMobile ? FG_CENTER_Y_MOBILE : FG_CENTER_Y);
      const rx = minDim * FG_RADIUS_X;
      const ry = minDim * FG_RADIUS_Y;
      const pad = 10;
      const margin = 18;

      ctx.font = LABEL_FONT;
      if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D).letterSpacing = "2px";
      const wRight = ctx.measureText(labels[1]).width;
      const wLeft = ctx.measureText(labels[3]).width;
      if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D).letterSpacing = "0px";

      let cx = cssW * (isMobile ? FG_CENTER_X_MOBILE : FG_CENTER_X);
      // keep the left node + label inside the right half on desktop (clear of the text column)
      if (!isMobile) cx = Math.max(cx, cssW * 0.5 + rx + FG_RING + pad + wLeft);
      // priority: keep the right node + label on-canvas
      cx = Math.min(cx, cssW - margin - FG_RING - pad - wRight - rx);

      const pts = [
        { x: cx, y: cy - ry }, // top
        { x: cx + rx, y: cy }, // right
        { x: cx, y: cy + ry }, // bottom
        { x: cx - rx, y: cy }, // left
      ];
      fgNodes = [
        { ...pts[0], label: labels[0], lx: pts[0].x, ly: pts[0].y - FG_RING - pad, align: "center", baseline: "bottom", phase: 0 },
        { ...pts[1], label: labels[1], lx: pts[1].x + FG_RING + pad, ly: pts[1].y, align: "left", baseline: "middle", phase: 1.6 },
        { ...pts[2], label: labels[2], lx: pts[2].x, ly: pts[2].y + FG_RING + pad, align: "center", baseline: "top", phase: 3.2 },
        { ...pts[3], label: labels[3], lx: pts[3].x - FG_RING - pad, ly: pts[3].y, align: "right", baseline: "middle", phase: 4.7 },
      ];
      // perimeter (top→right→bottom→left→top) + vertical diagonal (top↔bottom)
      fgEdges = [
        { a: 0, b: 1, offset: 0 },
        { a: 1, b: 2, offset: 0.25 },
        { a: 2, b: 3, offset: 0.5 },
        { a: 3, b: 0, offset: 0.75 },
        { a: 0, b: 2, offset: 0.4 },
      ];
    };

    const sweepCxAt = (now: number) => {
      const phase = (now % SWEEP_DURATION) / SWEEP_DURATION;
      const eased = 0.5 - 0.5 * Math.cos(Math.PI * phase); // eased one-way pass, off-screen at the wrap
      const travel = cssW + SWEEP_BAND_WIDTH * 2;
      return -SWEEP_BAND_WIDTH + eased * travel;
    };

    // 0..1 how strongly the (tilted) sweep centerline is lighting a point
    const boostAt = (px: number, py: number, sweepCx: number | null) => {
      if (sweepCx == null) return 0;
      const local = (px - sweepCx) * cosSkew + (py - cssH / 2) * sinSkew;
      return Math.exp(-Math.pow(local / SWEEP_FALLOFF, 2));
    };

    const drawSweep = (sweepCx: number) => {
      const half = SWEEP_BAND_WIDTH / 2;
      const tall = Math.hypot(cssW, cssH);
      ctx.save();
      ctx.translate(sweepCx, cssH / 2);
      ctx.rotate(skewRad);
      const g = ctx.createLinearGradient(-half, 0, half, 0);
      g.addColorStop(0, `rgba(${COLORS.molten},0)`);
      g.addColorStop(0.4, `rgba(${COLORS.amber},${SWEEP_ALPHA * 0.7})`);
      g.addColorStop(0.5, `rgba(${COLORS.molten},${SWEEP_ALPHA})`);
      g.addColorStop(0.6, `rgba(${COLORS.amber},${SWEEP_ALPHA * 0.7})`);
      g.addColorStop(1, `rgba(${COLORS.molten},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(-half, -tall, SWEEP_BAND_WIDTH, tall * 2);
      ctx.restore();
    };

    const drawBg = (t: number | null, sweepCx: number | null) => {
      // dim static web of edges
      ctx.strokeStyle = COLORS.bgEdge;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (const e of bgEdges) {
        ctx.moveTo(bgNodes[e.a].x, bgNodes[e.a].y);
        ctx.lineTo(bgNodes[e.b].x, bgNodes[e.b].y);
      }
      ctx.stroke();
      // dim nodes; brighten briefly as the sweep crosses
      for (const n of bgNodes) {
        const boost = boostAt(n.x, n.y, sweepCx);
        const shimmer = t === null ? 0 : 0.05 * Math.sin(t * n.speed + n.phase);
        if (boost > 0.03) {
          const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 6);
          glow.addColorStop(0, `rgba(${COLORS.amber},${boost * 0.5})`);
          glow.addColorStop(1, `rgba(${COLORS.amber},0)`);
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r * 6, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = Math.min(1, 0.85 + shimmer + boost * 0.15);
        ctx.fillStyle = COLORS.bgNode;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    };

    const drawFg = (t: number | null, sweepCx: number | null, animate: boolean) => {
      // bright orange connectors (+ traveling gold highlight)
      ctx.lineWidth = 1.5;
      for (const e of fgEdges) {
        const a = fgNodes[e.a];
        const b = fgNodes[e.b];
        const boost = Math.max(boostAt(a.x, a.y, sweepCx), boostAt(b.x, b.y, sweepCx));
        ctx.strokeStyle = `rgba(${COLORS.molten},${0.5 + 0.4 * boost})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        if (animate && t !== null) {
          const p = (t * TRAVEL_SPEED + e.offset) % 1;
          const hx = a.x + (b.x - a.x) * p;
          const hy = a.y + (b.y - a.y) * p;
          const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, 11);
          g.addColorStop(0, `rgba(${COLORS.gold},0.85)`);
          g.addColorStop(1, `rgba(${COLORS.gold},0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(hx, hy, 11, 0, TAU);
          ctx.fill();
        }
      }
      // nodes: soft orange ring + gold dot
      for (const n of fgNodes) {
        const boost = boostAt(n.x, n.y, sweepCx);
        const pulse = animate && t !== null ? PULSE_AMP * Math.sin(t * PULSE_RATE + n.phase) : 0;
        const ring = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, FG_RING);
        ring.addColorStop(0, `rgba(${COLORS.molten},${0.32 + 0.4 * boost + pulse * 0.4})`);
        ring.addColorStop(0.55, `rgba(${COLORS.molten},${0.12 + 0.2 * boost})`);
        ring.addColorStop(1, `rgba(${COLORS.molten},0)`);
        ctx.fillStyle = ring;
        ctx.beginPath();
        ctx.arc(n.x, n.y, FG_RING, 0, TAU);
        ctx.fill();
        ctx.fillStyle = `rgba(${COLORS.gold},${Math.min(1, 0.85 + boost * 0.15)})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, FG_DOT * (1 + pulse + boost * 0.2), 0, TAU);
        ctx.fill();
      }
      // labels (legibility first): outboard, DM Mono, uppercase, tracked, brighten on sweep
      ctx.font = LABEL_FONT;
      if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D).letterSpacing = "2px";
      for (const n of fgNodes) {
        const boost = boostAt(n.x, n.y, sweepCx);
        ctx.fillStyle = `rgba(${COLORS.ink},${0.62 + 0.38 * boost})`;
        ctx.textAlign = n.align;
        ctx.textBaseline = n.baseline;
        ctx.fillText(n.label.toUpperCase(), n.lx, n.ly);
      }
      if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D).letterSpacing = "0px";
    };

    const drawVignette = () => {
      const cx = cssW * 0.5;
      const cy = cssH * 0.45;
      const outer = Math.hypot(cssW, cssH) * 0.62;
      const g = ctx.createRadialGradient(cx, cy, outer * 0.4, cx, cy, outer);
      g.addColorStop(0, "rgba(10,10,11,0)");
      g.addColorStop(0.6, "rgba(10,10,11,0)");
      g.addColorStop(1, "rgba(10,10,11,1)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cssW, cssH);
    };

    const render = (now: number, t: number | null, animate: boolean) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.drawImage(base, 0, 0, cssW, cssH);
      const sweepCx = animate ? sweepCxAt(now) : null;
      if (animate) drawSweep(sweepCx as number);
      drawBg(animate ? t : null, sweepCx);
      drawFg(animate ? t : null, sweepCx, animate);
      drawVignette();
    };

    const loop = (now: number) => {
      if (!startTs) startTs = now;
      render(now, (now - startTs) / 1000, !staticMode);
      raf = requestAnimationFrame(loop);
    };
    const startLoop = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const stopLoop = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const resize = () => {
      const rect = container.getBoundingClientRect();
      cssW = Math.max(1, rect.width);
      cssH = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      isMobile = window.innerWidth < MOBILE_BREAKPOINT;
      staticMode = reducedMq.matches || isMobile;
      buildBase();
      layoutBg();
      layoutFg();

      // paint one frame synchronously so the canvas is never blank
      render(performance.now(), staticMode ? null : 0, !staticMode);
      if (staticMode) stopLoop();
      else if (visible) startLoop();
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (staticMode) return;
        if (visible) startLoop();
        else stopLoop();
      },
      { threshold: 0 }
    );
    io.observe(container);

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);

    const onReducedChange = () => resize();
    reducedMq.addEventListener?.("change", onReducedChange);

    resize();
    // re-paint once the label font is ready (canvas text needs the loaded face)
    document.fonts?.ready.then(() => {
      if (!disposed && staticMode) render(performance.now(), null, false);
    });

    return () => {
      disposed = true;
      stopLoop();
      io.disconnect();
      ro.disconnect();
      reducedMq.removeEventListener?.("change", onReducedChange);
    };
  }, [labelKey]);

  return (
    <div ref={containerRef} className={`relative isolate overflow-hidden ${className}`}>
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0" />
      <div className="relative z-10 w-full">{children}</div>
    </div>
  );
}
