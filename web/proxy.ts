import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Next.js 16 renamed `middleware` → `proxy`. Clerk's `clerkMiddleware` is the
 * proxy handler (default export). Everything is private by default: only the
 * marketing landing page and the auth pages are public, so every app route
 * (the /console* dashboard + /cowork* workspace) is guarded without having to
 * enumerate each one.
 */
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/terms",
  "/privacy",
  "/contact", // public legal/contact page — Meta & Google app review must reach it signed-out
  "/device", // public product page for the mrk hardware, linked from the landing
  "/pricing", // public 3-tier plans page; also the locked-tab / gate destination
  "/taster(.*)", // free no-signup analysis pages — the whole point is no auth
  "/studio(.*)", // unified Studio: the full read (verdict + Business DNA) is free/anon; only Create gates
  "/brain(.*)", // standalone Brain test bench — isolated, no auth
  "/api/apply", // public Founding-500 POST (honeypot + rate-limited); also serves the standalone /form site via CORS
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp4|webm|glb|gltf)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
