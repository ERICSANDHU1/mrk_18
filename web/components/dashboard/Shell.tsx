"use client";

import { useSyncExternalStore } from "react";
import { MotionConfig } from "framer-motion";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import MobileTabBar from "./MobileTabBar";
import OnboardingOverlay from "./OnboardingOverlay";

const COLLAPSE_KEY = "mrk18.sidebar.collapsed";
const COLLAPSE_EVENT = "mrk18:sidebar";

// session fallback when localStorage is unavailable (private mode)
let memCollapsed: boolean | null = null;

function subscribe(cb: () => void) {
  window.addEventListener(COLLAPSE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(COLLAPSE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function getCollapsed() {
  if (memCollapsed !== null) return memCollapsed;
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Dashboard chrome: sidebar + topbar + scrollable main. Motion respects OS setting. */
export default function Shell({ children }: { children: React.ReactNode }) {
  // SSR renders expanded; the client snapshot takes over after hydration
  const collapsed = useSyncExternalStore(subscribe, getCollapsed, () => false);

  const toggle = () => {
    memCollapsed = !collapsed;
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "0" : "1");
    } catch {
      /* session fallback already set */
    }
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  };

  return (
    <MotionConfig reducedMotion="user">
      <a
        href="#main"
        className="sr-only z-[70] rounded-lg bg-amber px-3 py-2 text-[13px] font-bold text-black focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <div className="flex min-h-dvh bg-bg text-ink">
        <Sidebar collapsed={collapsed} onToggle={toggle} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main
            id="main"
            className="dash-scroll mx-auto w-full max-w-[1400px] flex-1 px-4 pb-24 pt-6 sm:px-6 lg:pb-10"
          >
            {children}
          </main>
        </div>
      </div>
      <MobileTabBar />
      <OnboardingOverlay />
    </MotionConfig>
  );
}
