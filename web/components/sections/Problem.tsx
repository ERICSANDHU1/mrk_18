import Reveal from "../ui/Reveal";
import Stat from "../ui/Stat";

const BAND = [
  { value: 11, suffix: "/11", label: "founders: green metrics, flat revenue" },
  { value: 27, suffix: " hrs", label: "/week lost to marketing they shouldn't touch" },
  { value: 2, suffix: "", label: "avg customers their green campaigns drove" },
  { value: 1, suffix: "", label: "honest second opinion missing" },
];

export default function Problem() {
  return (
    <section className="relative px-6 py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <span className="text-[12px] font-semibold uppercase tracking-[0.3em] text-muted">
            01 — The problem
          </span>
        </Reveal>

        <Reveal delay={0.08}>
          <h2 className="mt-6 max-w-3xl text-[clamp(2.2rem,5.5vw,4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
            Your dashboard is green.{" "}
            <em className="text-gradient italic">Your bank account isn&apos;t.</em>
          </h2>
        </Reveal>

        <Reveal delay={0.16}>
          <div className="glass mt-12 max-w-2xl rounded-2xl p-8">
            <p className="text-lg leading-relaxed text-ink/90">
              Most founders don&apos;t have a marketing problem — they have a measurement problem.
              Activity is easy to grow. Revenue was always the only point.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.22}>
          <div className="mt-16 grid grid-cols-2 gap-x-8 gap-y-10 border-t border-stroke pt-12 md:grid-cols-4">
            {BAND.map((s) => (
              <Stat key={s.label} value={s.value} suffix={s.suffix} label={s.label} />
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
