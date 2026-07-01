"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { useEffect, useState } from "react";

/** ClerkProvider that follows the app's Appearance (System / Light / Dark).
 *  Watches the `mrk18-dark` class on <html> (set by ThemeToggle + the no-flash
 *  script), so the account modal, user popover and auth pages match the theme. */
export default function ClerkThemed({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(
    () => typeof window !== "undefined" && document.documentElement.classList.contains("mrk18-dark"),
  );

  useEffect(() => {
    const el = document.documentElement;
    const update = () => setIsDark(el.classList.contains("mrk18-dark"));
    update();
    const mo = new MutationObserver(update);
    mo.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  return (
    <ClerkProvider
      appearance={{
        baseTheme: isDark ? dark : undefined,
        variables: isDark
          ? {
              // the app's night palette — warm dark grays, quiet accent
              colorPrimary: "#d6d3ca",
              colorBackground: "#30302e",
              colorInputBackground: "#262624",
              colorText: "#e8e6e1",
              colorTextSecondary: "#b3b1a8",
              colorNeutral: "#e8e6e1",
              borderRadius: "0.6rem",
              fontFamily: "var(--font-claude-sans), system-ui, sans-serif",
            }
          : {
              colorPrimary: "#b4532a",
              colorBackground: "#ffffff",
              borderRadius: "0.6rem",
              fontFamily: "var(--font-hanken), system-ui, sans-serif",
            },
        elements: {
          card: "bg-surface border border-stroke-2 shadow-xl",
          headerTitle: "tracking-tight",
          socialButtonsBlockButton: "border-stroke-2",
          formButtonPrimary: isDark
            ? "bg-[#d6d3ca] text-[#232220] font-bold hover:opacity-90"
            : "bg-molten text-white font-bold hover:opacity-90",
          footerActionLink: isDark ? "text-[#d6d3ca] hover:underline" : "text-molten hover:underline",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
