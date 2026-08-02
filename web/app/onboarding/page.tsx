"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import OnboardingForm from "@/components/app/cowork/OnboardingForm";

function Spinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="animate-spin text-mute-2" size={22} aria-label="Loading your setup" />
    </div>
  );
}

/** Post-login setup. A founder who has already onboarded is bounced onward; a new
 *  founder fills the form once. Where they land after depends on how they got
 *  here: `?from=chat` (the 5-free-chats wall) returns them to Chat with their 10
 *  unlocked; otherwise the Dashboard, where the answers show up in "The Brain". */
function OnboardingInner() {
  const router = useRouter();
  const params = useSearchParams();
  const dest = params.get("from") === "chat" ? "/chat" : "/console";
  const [state, setState] = useState<"checking" | "form">("checking");

  const check = useCallback(() => {
    fetch("/api/me/profile", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.complete) router.replace(dest);
        else setState("form");
      })
      .catch(() => setState("form")); // backend down → show the form, submit surfaces the error
  }, [router, dest]);

  useEffect(() => {
    check();
  }, [check]);

  if (state === "checking") return <Spinner />;
  return <OnboardingForm onComplete={() => router.push(dest)} />;
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <OnboardingInner />
    </Suspense>
  );
}
