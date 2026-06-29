"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Rail from "./Rail";
import { RightPanelCtx } from "./right-panel-slot";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const LEFT = { min: 200, max: 340, def: 232, rail: 64 };
const RIGHT = { min: 260, max: 480, def: 340, rail: 44 };
const CMO_W = 360; // the floating CmoPanel drawer width (w-[360px])
const K = { lc: "mrk18.leftCollapsed", lw: "mrk18.leftWidth", rw: "mrk18.rightWidth" };

/** Drag-to-resize / click-to-collapse handle with a hover hint. */
function Handle({ side, shortcut, onResizeStart }: { side: "left" | "right"; shortcut: string; onResizeStart: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onResizeStart}
      className={`group absolute top-0 z-30 h-full w-1.5 cursor-col-resize ${side === "left" ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2"}`}
      aria-hidden
    >
      <div className={`h-full w-px bg-transparent transition-colors duration-150 group-hover:bg-molten/50 ${side === "left" ? "ml-auto" : ""}`} />
      <div
        className={`pointer-events-none absolute top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[#1b1815] px-3 py-2 text-[12px] leading-relaxed text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 ${
          side === "left" ? "left-3" : "right-3"
        }`}
      >
        <div>
          Click to collapse <span className="font-data ml-1 text-white/55">{shortcut}</span>
        </div>
        <div className="text-white/55">Drag to resize</div>
      </div>
    </div>
  );
}

/**
 * App shell with a collapsible/resizable left nav and a content-driven right
 * panel (pages dock content via <RightPanelSlot>). Ctrl/Cmd+B toggles the left,
 * Ctrl/Cmd+Alt+B the right. Each rail edge: click to collapse, drag to resize.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [leftWidth, setLeftWidth] = useState(LEFT.def);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [rightWidth, setRightWidth] = useState(RIGHT.def);
  const [cmoOpen, setCmoOpen] = useState(false); // the floating CMO panel is open
  const [wide, setWide] = useState(true); // ≥lg — only then is there room to pad for the panel
  const [ready, setReady] = useState(false);
  const [slotNode, setSlotNode] = useState<HTMLDivElement | null>(null);
  const [hasContent, setHasContent] = useState(false);
  const dragRef = useRef<{ side: "left" | "right"; startX: number; moved: boolean } | null>(null);

  // hydrate
  useEffect(() => {
    try {
      const g = (k: string) => localStorage.getItem(k);
      if (g(K.lc) !== null) setLeftCollapsed(g(K.lc) === "1");
      const lw = Number(g(K.lw));
      if (lw) setLeftWidth(clamp(lw, LEFT.min, LEFT.max));
      const rw = Number(g(K.rw));
      if (rw) setRightWidth(clamp(rw, RIGHT.min, RIGHT.max));
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => { if (ready) try { localStorage.setItem(K.lc, leftCollapsed ? "1" : "0"); } catch {} }, [leftCollapsed, ready]);
  useEffect(() => { if (ready) try { localStorage.setItem(K.lw, String(leftWidth)); } catch {} }, [leftWidth, ready]);
  useEffect(() => { if (ready) try { localStorage.setItem(K.rw, String(rightWidth)); } catch {} }, [rightWidth, ready]);

  // a page docking content opens the right panel; removing it closes it
  const register = useCallback((on: boolean) => {
    setHasContent(on);
    if (on) setRightCollapsed(false);
  }, []);

  // keyboard: Ctrl/Cmd+B = left, + Alt = right
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        if (e.altKey) setRightCollapsed((v) => !v);
        else setLeftCollapsed((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // the floating CMO panel announces open/close → collapse the rail + pad content
  useEffect(() => {
    const onOpen = () => setCmoOpen(true);
    const onClose = () => setCmoOpen(false);
    const mq = window.matchMedia("(min-width: 1024px)");
    const onWide = () => setWide(mq.matches);
    onWide();
    window.addEventListener("mrk18:cmo-open", onOpen);
    window.addEventListener("mrk18:cmo-closed", onClose);
    mq.addEventListener("change", onWide);
    return () => {
      window.removeEventListener("mrk18:cmo-open", onOpen);
      window.removeEventListener("mrk18:cmo-closed", onClose);
      mq.removeEventListener("change", onWide);
    };
  }, []);

  // drag-to-resize + click-to-collapse (no drag = click)
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.moved && Math.abs(e.clientX - d.startX) <= 3) return;
      d.moved = true;
      if (d.side === "left") setLeftWidth(clamp(e.clientX, LEFT.min, LEFT.max));
      else setRightWidth(clamp(window.innerWidth - e.clientX, RIGHT.min, RIGHT.max));
    };
    const up = () => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.moved) {
        if (d.side === "left") setLeftCollapsed((v) => !v);
        else setRightCollapsed((v) => !v);
      }
      dragRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  const beginDrag = (side: "left" | "right") => (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { side, startX: e.clientX, moved: false };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };

  // the CMO panel forces the rail shut (without touching the user's saved choice)
  const railCollapsed = cmoOpen || leftCollapsed;
  const lw = railCollapsed ? LEFT.rail : leftWidth;
  const rw = rightCollapsed ? RIGHT.rail : rightWidth;
  const wt = dragRef.current ? "none" : "width 0.18s ease";

  return (
    <RightPanelCtx.Provider value={{ node: slotNode, register }}>
      <div className="flex h-full w-full overflow-hidden">
        {/* LEFT — nav */}
        <div className="relative z-20 h-full shrink-0" style={{ width: lw, transition: wt }}>
          <Rail collapsed={railCollapsed} onToggle={() => setLeftCollapsed((v) => !v)} />
          {!railCollapsed && <Handle side="left" shortcut="Ctrl+B" onResizeStart={beginDrag("left")} />}
        </div>

        {/* MAIN */}
        <main
          className="relative min-w-0 flex-1 overflow-hidden"
          style={{ paddingRight: cmoOpen && wide ? CMO_W : 0, transition: "padding 0.2s ease" }}
        >
          {children}
        </main>

        {/* RIGHT — content-driven (renders only when a page docks content) */}
        {hasContent && (
          <div className="relative z-20 h-full shrink-0 border-l border-line bg-[var(--sidebar)]" style={{ width: rw, transition: wt }}>
            {rightCollapsed ? (
              <div className="flex h-full flex-col items-center py-3">
                <button
                  onClick={() => setRightCollapsed(false)}
                  title="Open panel (Ctrl+Alt+B)"
                  aria-label="Open right panel"
                  className="grid h-9 w-9 place-items-center rounded-xl text-mute-2 transition-colors hover:bg-surface hover:text-ink"
                >
                  <ChevronLeft size={18} aria-hidden />
                </button>
              </div>
            ) : (
              <>
                <Handle side="right" shortcut="Ctrl+Alt+B" onResizeStart={beginDrag("right")} />
                <button
                  onClick={() => setRightCollapsed(true)}
                  title="Collapse panel (Ctrl+Alt+B)"
                  aria-label="Collapse right panel"
                  className="absolute right-2 top-3 z-10 grid h-7 w-7 place-items-center rounded-lg text-mute-2 transition-colors hover:bg-[var(--overlay-subtle)] hover:text-ink"
                >
                  <ChevronRight size={16} aria-hidden />
                </button>
                <div ref={setSlotNode} className="h-full" />
              </>
            )}
          </div>
        )}
      </div>
    </RightPanelCtx.Provider>
  );
}
