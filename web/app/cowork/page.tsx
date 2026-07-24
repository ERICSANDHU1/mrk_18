"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import OnboardingForm from "@/components/app/cowork/OnboardingForm";
import RealCowork, { type FounderProfile } from "@/components/app/cowork/RealCowork";
import { useDemoMode, COMRK_DEMO } from "@/lib/demo-mode";

type Loaded = { loading: false; complete: boolean; profile: FounderProfile | null };
type State = { loading: true } | Loaded;

/** Real backend state decides the view: completed profile → workspace; else → onboarding. */
export default function CoworkPage() {
  const { ready, demo } = useDemoMode();
  const [state, setState] = useState<State>({ loading: true });

  const fetchProfile = useCallback(() => {
    fetch("/api/me/profile", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) =>
        setState({ loading: false, complete: !!d.complete, profile: (d.profile as FounderProfile) ?? null }),
      )
      .catch(() => setState({ loading: false, complete: false, profile: null }));
  }, []);

  useEffect(() => {
    if (!ready || demo) return; // demo visitors never hit the backend
    fetchProfile();
  }, [ready, demo, fetchProfile]);

  const reload = () => {
    setState({ loading: true });
    fetchProfile();
  };

  // Demo visitor: straight into the workspace on sample data, no onboarding.
  if (demo) {
    return <RealCowork profile={COMRK_DEMO.profile as FounderProfile} demo />;
  }

  if (!ready || state.loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="animate-spin text-mute-2" size={22} aria-label="Loading your workspace" />
      </div>
    );
  }

  if (!state.complete || !state.profile) {
    return <OnboardingForm onComplete={reload} />;
  }

  return <RealCowork profile={state.profile} />;
}
