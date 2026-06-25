import Link from "next/link";
import { Brain, Check } from "lucide-react";
import CoworkRuns from "./CoworkRuns";

export interface FounderProfile {
  company_name: string;
  website: string;
  product_description: string;
  icp: string;
  top_competitors: string[];
  tone: string;
  primary_goal: string;
  monthly_spend_inr: number;
  target_platforms: string[];
}

const PLATFORM_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  x: "X",
  instagram: "Instagram",
};

function inr(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3.5">
      <p className="font-data text-[10px] uppercase tracking-[0.14em] text-mute-2">{label}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink">{value}</p>
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((c) => (
        <span key={c} className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[12px] font-semibold">
          {c}
        </span>
      ))}
    </span>
  );
}

/** Returning founder: real company memory from Supabase — no mock. */
export default function RealCowork({ profile }: { profile: FounderProfile }) {
  const platforms = (profile.target_platforms ?? []).map((p) => PLATFORM_LABEL[p] ?? p);

  return (
    <div className="flex h-full">
      {/* Workspace */}
      <div className="dash-scroll flex-1 overflow-y-auto p-5 sm:p-7">
        <header className="mb-5">
          <p className="font-data text-[11px] uppercase tracking-[0.18em] text-mute-2">Cowork · Workspace</p>
          <h1 className="font-display mt-1.5 text-2xl">{profile.company_name}</h1>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-mute">
            Your CMO has your company memory. The next step is your first strategy run — it turns this memory
            into briefs, posts and a calendar.
          </p>
        </header>

        <div className="mb-4 flex items-center gap-2 rounded-xl border border-molten/20 bg-molten/[0.05] px-3.5 py-2.5">
          <Check size={15} className="text-molten" aria-hidden />
          <p className="text-[12.5px] leading-snug text-ink/90">
            Company memory captured — your CMO knows who you are, who you serve, and how you want to sound.
          </p>
        </div>

        <div className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-[14px] font-bold tracking-tight">What you do</h2>
          <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-mute">
            {profile.product_description}
          </p>
        </div>

        <CoworkRuns />
      </div>

      {/* Brain — real profile */}
      <aside className="dash-scroll hidden w-[380px] shrink-0 flex-col overflow-y-auto border-l border-line bg-[var(--sidebar)] p-5 lg:flex">
        <header className="mb-1 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[15px] font-extrabold tracking-tight">
            <Brain size={17} className="text-molten" aria-hidden /> The Brain
          </h2>
        </header>
        <p className="mb-4 text-[12px] text-mute">
          What your CMO knows about you — straight from your onboarding, stored in your workspace.
        </p>
        <div className="space-y-2.5">
          <Fact label="Company" value={<>{profile.company_name} · <span className="text-mute">{profile.website}</span></>} />
          <Fact label="Who you serve" value={profile.icp} />
          <Fact label="Competitors" value={<Chips items={profile.top_competitors} />} />
          <Fact label="Voice" value={profile.tone} />
          <Fact label="Primary goal" value={profile.primary_goal} />
          <Fact label="Monthly spend" value={`${inr(profile.monthly_spend_inr)} / mo`} />
          <Fact label="Publishes to" value={<Chips items={platforms} />} />
        </div>
        <p className="mt-4 rounded-lg border border-line bg-surface/50 p-3 text-[11px] leading-relaxed text-mute-2">
          What it <span className="text-mute">thinks</span> and <span className="text-mute">commands</span> fills
          in after your first run, as real performance data comes back.{" "}
          <Link href="/console" className="font-semibold text-amber hover:opacity-80">
            Open the dashboard
          </Link>
        </p>
      </aside>
    </div>
  );
}
