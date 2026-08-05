"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";

/** Renders a Mermaid flowchart (the CMO's ```mermaid blocks) as an SVG, with a
 *  toolbar to EXPAND it fullscreen (zoom + pan) and EXPORT it (download / copy as
 *  a PNG). Mermaid is loaded lazily on first use so it never sits in the main chat
 *  bundle. Labels render as SVG <text> (htmlLabels:false) so the diagram rasterises
 *  cleanly to an image for copy/download. */
let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      m.default.initialize({
        startOnLoad: false,
        securityLevel: "strict", // sanitizes the SVG we inject
        theme: "base",
        flowchart: {
          htmlLabels: false, // SVG <text> labels → they survive PNG export
          curve: "basis",
          useMaxWidth: true,
          nodeSpacing: 42,
          rankSpacing: 46,
          padding: 12,
        },
        themeVariables: {
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontSize: "14px",
          primaryColor: "#241f18",
          primaryTextColor: "#f2ece2",
          primaryBorderColor: "#ef6a2b",
          lineColor: "#8a7f6f",
          secondaryColor: "#1f1c18",
          tertiaryColor: "#1a1610",
        },
      });
      return m.default;
    });
  }
  return mermaidPromise;
}

const CHART_BG = "#16130e";
let idCounter = 0;

/** intrinsic size from the svg's viewBox — for a crisp raster export */
function svgSize(svg: string): { w: number; h: number } {
  const vb = svg.match(/viewBox="([-\d.\s]+)"/);
  if (vb) {
    const p = vb[1].trim().split(/\s+/).map(Number);
    if (p.length === 4 && p[2] > 0 && p[3] > 0) return { w: p[2], h: p[3] };
  }
  return { w: 900, h: 640 };
}

/** rasterise the mermaid SVG to a PNG Blob (2× for retina crispness) */
async function svgToPng(svg: string, scale = 2): Promise<Blob | null> {
  const { w, h } = svgSize(svg);
  // Force explicit pixel dimensions on the ROOT <svg> tag. Mermaid (useMaxWidth:true)
  // emits width="100%" + a max-width style; a %-width svg rasterises to NOTHING as an
  // <img>, so strip width/height/max-width off the opening tag and set concrete px.
  const gt = svg.indexOf(">");
  let head = svg.slice(0, gt);
  const rest = svg.slice(gt);
  head = head
    .replace(/\swidth="[^"]*"/g, "")
    .replace(/\sheight="[^"]*"/g, "")
    .replace(/\sstyle="[^"]*"/g, (m) => {
      const cleaned = m.replace(/max-width:[^;"]*;?/g, "");
      return /style="\s*"/.test(cleaned) ? "" : cleaned;
    });
  if (!/xmlns=/.test(head)) head = head.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  head += ` width="${w}" height="${h}"`;
  const src = head + rest;
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("svg load failed"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = CHART_BG; // opaque bg so the PNG isn't transparent
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob((b) => res(b), "image/png"));
  } catch {
    return null;
  }
}

function IconBtn({
  onClick,
  title,
  children,
  className = "",
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`grid h-7 w-7 place-items-center rounded-lg text-mute-2 transition-colors hover:bg-surface-2 hover:text-ink ${className}`}
    >
      {children}
    </button>
  );
}

export default function MermaidChart({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    setSvg(null);
    setFailed(false);
    const id = `mmd-${++idCounter}`;
    loadMermaid()
      .then((mermaid) => mermaid.render(id, code))
      .then(({ svg }) => {
        if (active) setSvg(svg);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [code]);

  const download = useCallback(async () => {
    if (!svg) return;
    const blob = await svgToPng(svg);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cmo-flowchart.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [svg]);

  const copyImage = useCallback(async () => {
    if (!svg) return;
    const blob = await svgToPng(svg);
    if (!blob) return download();
    try {
      // copy the PNG to the clipboard so it pastes into docs / chat / slides
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard-image unsupported (e.g. Firefox) → fall back to a download
      download();
    }
  }, [svg, download]);

  if (failed) {
    // don't lose the answer — show the steps as text if the diagram won't draw
    return (
      <pre className="dash-scroll my-1 overflow-x-auto rounded-lg border border-line bg-surface-2 p-3 text-[11px] leading-relaxed text-mute">
        {code}
      </pre>
    );
  }
  if (!svg) {
    return (
      <div className="my-1 rounded-xl border border-line bg-surface-2 px-4 py-6 text-center text-[12px] text-mute-2">
        drawing the flowchart…
      </div>
    );
  }

  return (
    <div className="my-1.5 overflow-hidden rounded-xl border border-line bg-[var(--bg,#16130e)]">
      {/* toolbar */}
      <div className="flex items-center justify-between gap-2 border-b border-line/70 px-2.5 py-1.5">
        <span className="font-data pl-1 text-[10.5px] uppercase tracking-wide text-mute-2">
          Decision flow
        </span>
        <div className="flex items-center gap-0.5">
          <IconBtn onClick={copyImage} title={copied ? "Copied!" : "Copy as image"}>
            {copied ? <Check size={14} className="text-molten" /> : <Copy size={14} />}
          </IconBtn>
          <IconBtn onClick={download} title="Download PNG">
            <Download size={14} />
          </IconBtn>
          <IconBtn onClick={() => setOpen(true)} title="Expand — zoom & pan">
            <Maximize2 size={14} />
          </IconBtn>
        </div>
      </div>
      {/* inline preview — click to open the full zoomable view */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Click to expand"
        className="dash-scroll block w-full cursor-zoom-in overflow-x-auto p-3 text-left [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
        // svg is mermaid-sanitized (securityLevel: strict)
        dangerouslySetInnerHTML={{ __html: svg }}
        aria-label="CMO decision flowchart — click to expand"
      />
      {open && (
        <Lightbox
          svg={svg}
          copied={copied}
          onCopy={copyImage}
          onDownload={download}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/** Fullscreen viewer: the flowchart big, with zoom (wheel / buttons) and drag-to-pan. */
function Lightbox({
  svg,
  copied,
  onCopy,
  onDownload,
  onClose,
}: {
  svg: string;
  copied: boolean;
  onCopy: () => void;
  onDownload: () => void;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const reset = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);
  const clamp = (s: number) => Math.min(6, Math.max(0.4, s));

  // esc to close + lock body scroll while open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // wheel-to-zoom (native, non-passive so we can preventDefault the page scroll)
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScale((s) => clamp(s * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, tx, ty };
    setDragging(true);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setTx(d.tx + (e.clientX - d.x));
    setTy(d.ty + (e.clientY - d.y));
  };
  const onPointerUp = () => {
    dragRef.current = null;
    setDragging(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col bg-black/85 backdrop-blur-sm">
      {/* toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="font-data text-[11px] uppercase tracking-wide text-white/60">
          CMO decision flow
        </span>
        <div className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-1.5 py-1">
          <button
            type="button"
            onClick={() => setScale((s) => clamp(s / 1.2))}
            title="Zoom out"
            aria-label="Zoom out"
            className="grid h-7 w-7 place-items-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Minus size={15} />
          </button>
          <span className="w-10 text-center text-[11px] font-semibold tabular-nums text-white/70">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setScale((s) => clamp(s * 1.2))}
            title="Zoom in"
            aria-label="Zoom in"
            className="grid h-7 w-7 place-items-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            onClick={reset}
            title="Reset view"
            aria-label="Reset view"
            className="grid h-7 w-7 place-items-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <RotateCcw size={14} />
          </button>
          <span className="mx-0.5 h-5 w-px bg-white/15" aria-hidden />
          <button
            type="button"
            onClick={onCopy}
            title={copied ? "Copied!" : "Copy as image"}
            className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            {copied ? <Check size={14} className="text-molten" /> : <Copy size={14} />}
            <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
          </button>
          <button
            type="button"
            onClick={onDownload}
            title="Download PNG"
            className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Download size={14} />
            <span className="hidden sm:inline">PNG</span>
          </button>
          <span className="mx-0.5 h-5 w-px bg-white/15" aria-hidden />
          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      {/* zoom + pan canvas */}
      <div
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        className="relative flex-1 touch-none select-none overflow-hidden"
        style={{ cursor: dragging ? "grabbing" : "grab" }}
      >
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div
            style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}
            className="origin-center transition-transform duration-75 [&_svg]:h-auto [&_svg]:max-h-[82vh] [&_svg]:w-auto [&_svg]:max-w-[88vw]"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
        <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[11px] text-white/55">
          Scroll to zoom · drag to move · Esc to close
        </p>
      </div>
    </div>,
    document.body,
  );
}
