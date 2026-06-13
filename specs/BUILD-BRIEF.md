# MRK18 Landing Rebuild + Film — BUILD BRIEF (all decisions LOCKED 2026-06-13)

Read together with: `MRK18-website-master-spec.md` + `ADDENDUM-1.10-spotlight-system.md`
+ `ADDENDUM-1.11-narrator-track.md` (all in this folder). Founder approved everything below
via dialog boxes; do not re-ask.

## Final page structure (the ONE landing page at `/`)
1. **Hero** — UNTOUCHED (current `components/sections/Hero.tsx`)
2. **01 — The Audit Receipt** (NEW, replaces current Problem section):
   a paper receipt prints downward line-by-line as you scroll —
   `Meta ads ₹40,000 → 2 customers` · `Agency retainer ₹25,000 → a PDF saying "all good"` ·
   `27 hrs of your week → ₹0` … then a red **LEAKING** stamp slams down.
   KEEP the existing 4 animated counters at the bottom: 11/11 · 27 hrs · 2 · 1.
   Use deck research data for receipt lines (₹450 CAC vs ₹599 price, 79% untracked, ₹60–80L CMO).
   Receipt paper visually rhymes with the film's falling brief below it (deliberate).
3. **02 — THE 12-FRAME FILM** embedded HERE (not at /story): the full master-spec scroll movie.
   Spec adaptations because it's mid-page: no separate preloader page, F1's "Meet your AI CMO"
   hero copy adapts (page already has a hero) — frames otherwise exactly per spec + addenda.
4. **03 — Features** — UNTOUCHED (`components/sections/Features.tsx`)
5. **04 — REMOVED** (old "What early founders say" deleted — fake-testimonial risk).
   Slot reserved; founder will brief new content later. Do NOT invent a replacement.
6. **05 Pricing → Contact → Footer** — as-is for now.

## The 7 locked film decisions
1. Build inside existing Next.js app (web/) — NOT a separate Vite app (spec §1.1 stack deviation approved; R3F 9/React 19/three 0.184/drei 10/lenis/framer-motion already installed; ADD zustand + @react-three/postprocessing).
2. Film embedded in landing (originally /story → superseded by embed decision).
3. Fonts: Clash Display (Fontshare) headlines + Space Grotesk/JetBrains Mono data. Sora stays on dashboard.
4. 3D actor: CODE-BUILT procedural mannequin (charcoal body, molten seam lines, sculpted face planes,
   no eyes) — Mixamo upgrade path designed in, proxy-first development for all 12 frames.
5. Ad mockup imagery (F5 Act 2): abstract black/orange brand art, generated.
6. Audio: IN for v1 — 4 moments (ambient hum, connect pulse F4, storm whoosh F7, piano note F11),
   synthesized in code, muted by default, navbar speaker toggle.
7. Contact: mrk18ai@gmail.com everywhere (fix wrong hello@mrk18.com on landing) ·
   LinkedIn https://www.linkedin.com/in/mrk-ai-4a78a9409 · X/Instagram added later.

## Build order
① Remove 04 + build Audit Receipt (same-day visible result)
② Film Phase 0 foundation: ScrollRoot (Lenis) + zustand store {g, v, activeScene, localProgress} +
   SceneManager (±1 mounting) + MasterCamera + particle singleton + SpotlightDirector + DimMask +
   NarratorTrack + DebugScrubber — gate: placeholder cube scrubs through 12 dummy scenes at 60fps
③ Frames per spec §5.2 phases 1–9, each phase gated by its acceptance check + QA (§5.5 + addenda QA)

## Environment facts
- Project home: **D:\mrk18** (moved off OneDrive 2026-06-13; old copy on OneDrive Desktop is
  READ-ONLY safety blanket, delete after a few days). D: = same NVMe SSD as C:.
- GitHub backup: ERICSANDHU1/mrk_18, checkpoint commit 80477ce. Commit+push regularly.
- execution/.venv NOT copied (venvs don't survive moves) — rebuild when execution work resumes.
- Deck-gap analysis (25 gaps, 10 conflicts vs F:\MRK18_Master_Pitch_Deck_FINAL.pdf) done & parked —
  pricing ladder ₹1,999/4,999/9,999, team/scar story, roadmap+wearable etc. available for later sections.
- Founder interaction style: ALWAYS ask questions via AskUserQuestion dialog boxes (they tick or
  type custom answers); explain in simple layman language with examples.
