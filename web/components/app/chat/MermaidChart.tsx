"use client";

import { useEffect, useState } from "react";

/** Renders a Mermaid flowchart (the CMO's ```mermaid blocks) as an SVG. Mermaid
 *  is loaded lazily on first use so it never sits in the main chat bundle. */
let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      m.default.initialize({
        startOnLoad: false,
        securityLevel: "strict", // sanitizes the SVG we inject
        theme: "base",
        flowchart: { htmlLabels: true, curve: "basis", useMaxWidth: true },
        themeVariables: {
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontSize: "13px",
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

let idCounter = 0;

export default function MermaidChart({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

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
    <div
      className="dash-scroll my-1.5 overflow-x-auto rounded-xl border border-line bg-[var(--bg,#16130e)] p-3 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
      // svg is mermaid-sanitized (securityLevel: strict)
      dangerouslySetInnerHTML={{ __html: svg }}
      role="img"
      aria-label="CMO decision flowchart"
    />
  );
}
