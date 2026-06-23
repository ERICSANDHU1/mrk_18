"use client";

import { createContext, useContext, useEffect } from "react";
import { createPortal } from "react-dom";

type Ctx = { node: HTMLElement | null; register: (on: boolean) => void };

export const RightPanelCtx = createContext<Ctx>({ node: null, register: () => {} });

/**
 * Docks its children into the AppShell's right panel (collapsible/resizable).
 * Renders nothing inline — the content portals into the shell's right rail.
 */
export function RightPanelSlot({ children }: { children: React.ReactNode }) {
  const { node, register } = useContext(RightPanelCtx);
  useEffect(() => {
    register(true);
    return () => register(false);
  }, [register]);
  return node ? createPortal(children, node) : null;
}
