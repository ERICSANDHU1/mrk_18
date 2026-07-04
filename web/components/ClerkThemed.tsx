"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** ClerkProvider that follows the app's Appearance (System / Light / Dark).
 *  Watches the `mrk18-dark` class on <html> (set by ThemeToggle + the no-flash
 *  script), so the account modal and user popover match the theme.
 *
 *  Exception: the sign-in / sign-up pages are always the warm-sand LIGHT shell
 *  (the night theme is scoped to the dashboard's `.app-scope`, which auth pages
 *  never carry). So Clerk must stay light there too — otherwise a dark card
 *  renders on the light auth page. Only follow the dark toggle off those routes. */
export default function ClerkThemed({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onAuthPage = pathname?.startsWith("/sign-in") || pathname?.startsWith("/sign-up");

  const [htmlDark, setHtmlDark] = useState(
    () => typeof window !== "undefined" && document.documentElement.classList.contains("mrk18-dark"),
  );

  useEffect(() => {
    const el = document.documentElement;
    const update = () => setHtmlDark(el.classList.contains("mrk18-dark"));
    update();
    const mo = new MutationObserver(update);
    mo.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  const isDark = htmlDark && !onAuthPage;

  return (
    <ClerkProvider
      appearance={{
        theme: isDark ? dark : undefined,
        variables: isDark
          ? {
              // the app's night palette — warm dark grays, quiet accent
              colorPrimary: "#d6d3ca",
              colorPrimaryForeground: "#232220",
              colorBackground: "#30302e",
              colorInput: "#262624",
              colorInputForeground: "#e8e6e1",
              colorForeground: "#e8e6e1",
              colorMutedForeground: "#b3b1a8",
              colorNeutral: "#e8e6e1",
              borderRadius: "0.6rem",
              fontFamily: "var(--font-claude-sans), system-ui, sans-serif",
            }
          : {
              colorPrimary: "#b4532a",
              colorBackground: "#ffffff",
              colorInput: "#fdfbf6",
              colorInputForeground: "#1b1815",
              colorForeground: "#1b1815",
              colorMutedForeground: "#6b6357",
              borderRadius: "0.6rem",
              fontFamily: "var(--font-hanken), system-ui, sans-serif",
            },
        elements: onAuthPage
          ? // sign-in / sign-up — the pages supply their own serif heading, so
            // Clerk's header goes away; the card floats on sand (shadow, no border)
            {
              rootBox: "w-full",
              cardBox:
                "w-full rounded-2xl border-none shadow-[0_1px_2px_rgba(27,24,21,0.05),0_16px_40px_-20px_rgba(27,24,21,0.28)]",
              card: "bg-white px-6 py-6 sm:px-7",
              header: "hidden",
              headerTitle: "hidden",
              headerSubtitle: "hidden",
              socialButtonsBlockButton:
                "h-10 rounded-xl border border-[#e7ded0] bg-white transition-colors hover:bg-[#faf6ee]",
              dividerLine: "bg-[#efe7d9]",
              dividerText: "text-[#8a8276]",
              formFieldLabel: "text-[12.5px] font-semibold text-[#1b1815]",
              formFieldInput: "h-10 rounded-xl border-[#e7ded0] bg-[#fdfbf6] text-[#1b1815]",
              formButtonPrimary:
                "h-10 rounded-xl bg-[#b4532a] text-[13.5px] font-bold text-white shadow-none transition-colors hover:bg-[#9c4523]",
              formFieldAction: "text-[#b4532a] font-semibold hover:underline",
              identityPreview: "border border-[#e7ded0] bg-[#faf6ee]",
              footerActionText: "text-[#6b6357]",
              footerActionLink: "text-[#b4532a] font-semibold hover:underline",
            }
          : {
              card: "bg-surface border border-stroke-2 shadow-xl",
              headerTitle: "tracking-tight",
              socialButtonsBlockButton: "border-stroke-2",
              formButtonPrimary: isDark
                ? "bg-[#d6d3ca] text-[#232220] font-bold hover:opacity-90"
                : "bg-molten text-white font-bold hover:opacity-90",
              footerActionLink: isDark
                ? "text-[#d6d3ca] hover:underline"
                : "text-molten hover:underline",
            },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
