"use client";

export default function Marquee({
  items,
  variant = "gradient",
}: {
  items: string[];
  variant?: "gradient" | "subtle";
}) {
  const row = (
    <>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-6 px-6 text-[13px] font-semibold uppercase tracking-[0.22em] whitespace-nowrap">
          {item}
          <span aria-hidden className={variant === "gradient" ? "text-[#0a0a0b]/60" : "text-gradient"}>
            ◆
          </span>
        </span>
      ))}
    </>
  );

  return (
    <div className="relative -mx-[5%] w-[110%] rotate-[1.2deg] overflow-hidden py-10" aria-hidden>
      <div
        className={`marquee overflow-hidden border-y ${
          variant === "gradient"
            ? "border-transparent text-[#0a0a0b]"
            : "border-stroke text-muted"
        } py-3.5`}
        style={
          variant === "gradient"
            ? { background: "var(--gradient-brand)" }
            : { background: "rgba(20,20,22,0.5)" }
        }
      >
        <div className="marquee-track">
          {row}
          {row}
        </div>
      </div>
    </div>
  );
}
