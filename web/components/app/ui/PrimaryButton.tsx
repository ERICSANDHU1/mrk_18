import Link from "next/link";

type Props = {
  children: React.ReactNode;
  className?: string;
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  "aria-label"?: string;
};

// size-agnostic: callers pass padding + text size via `className` (no conflicts)
const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-molten font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60";

/** The one primary action button — a flat molten fill (theme-aware), single
 *  weight, one hover. Replaces the `from-molten via-amber to-ember` gradient,
 *  which collapsed to a flat block in light and a loud band in dark. */
export default function PrimaryButton({
  children,
  className = "",
  href,
  onClick,
  type = "button",
  disabled,
  ...rest
}: Props) {
  const cls = `${BASE} ${className}`;
  if (href) {
    return (
      <Link href={href} className={cls} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls} {...rest}>
      {children}
    </button>
  );
}
