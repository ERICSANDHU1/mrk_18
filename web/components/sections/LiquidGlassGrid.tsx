/** One continuous glass panel — fills its nearest `relative` parent (the three
 *  pricing rows, not the section header). Glassmorphism 2.0, same recipe as the
 *  hero/device/feature panes: translucent gradient fill + 20px blur so the 3D
 *  shapes frost through as soft color instead of colliding with the row text,
 *  bright light-catching edge + hairline dark rim for thickness. Purely visual. */
export default function LiquidGlassGrid() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="h-full w-full rounded-[2rem] border border-white/90 bg-gradient-to-br from-white/[0.58] to-white/[0.2] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(255,255,255,0.3),0_0_0_1px_rgba(27,24,21,0.05),0_12px_40px_rgba(27,24,21,0.16)] backdrop-blur-[20px] backdrop-saturate-[1.4]" />
    </div>
  );
}
