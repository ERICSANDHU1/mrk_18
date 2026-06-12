/** One-line plain-language takeaway — required above every chart. */
export default function Takeaway({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-sm leading-snug text-ink">{children}</p>;
}
