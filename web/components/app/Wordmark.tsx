/** The mrk18 wordmark. "mrk" inherits the surrounding text color; the "18" is
 *  tinted oxblood — the theme-aware `--oxblood` token by default (deep #6B1A1A on
 *  light grounds, raised #B23A3A on dark, lifted #C24A43 in night mode). Pass an
 *  explicit `oxblood` where a surface hardcodes its own palette (e.g. the auth
 *  screen, whose two sides sit on different grounds within one dark route).
 *
 *  This is the ONE place the "18" tint lives — every nav/footer/sidebar/auth/
 *  loading wordmark renders through it, so the color can never drift again. */
export default function Wordmark({
  className,
  oxblood,
}: {
  className?: string;
  oxblood?: string;
}) {
  return (
    <span className={className}>
      mrk
      <span className={oxblood ? undefined : "text-oxblood"} style={oxblood ? { color: oxblood } : undefined}>
        18
      </span>
    </span>
  );
}
