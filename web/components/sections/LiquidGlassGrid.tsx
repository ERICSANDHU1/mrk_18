/** One continuous liquid-glass panel — fills its nearest `relative` parent
 *  (the three pricing rows, not the section header). The floating 3D shapes
 *  frost + refract through it. Purely visual. */
export default function LiquidGlassGrid() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="h-full w-full rounded-[2rem] border border-white/40 bg-gradient-to-br from-white/[0.13] to-white/[0.03] shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-[3px] backdrop-saturate-150 backdrop-brightness-[1.04]" />
    </div>
  );
}
