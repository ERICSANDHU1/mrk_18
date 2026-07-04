/** The mrk18 prism mark — an oxblood crown over two graded-charcoal pavilion
 *  facets. The pavilion follows `--ink` (dark on the light theme, light on the
 *  night theme) so it flips with the app; the crown keeps the brand oxblood.
 *  `size` is the mark's height in px; width follows the mark's ~0.65 ratio. */
export default function Logo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={Math.round(size * 0.66)}
      height={size}
      viewBox="24 10 52 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <polygon points="24,40 76,40 50,10" fill="#a8322f" />
      <polygon points="24,40 50,40 50,90" style={{ fill: "var(--ink)" }} fillOpacity={0.5} />
      <polygon points="50,40 76,40 50,90" style={{ fill: "var(--ink)" }} fillOpacity={0.82} />
      <line
        x1="50"
        y1="40"
        x2="50"
        y2="90"
        style={{ stroke: "var(--ink)" }}
        strokeWidth={1.4}
        strokeOpacity={0.25}
      />
    </svg>
  );
}
