# GLOBAL ADDENDUM §1.10 — THE SPOTLIGHT SYSTEM (LOCKED)

Apply together with MRK18-website-master-spec.md. This is an additive lighting/staging
layer: change NO locked decision in that spec. Where this addendum and the spec
describe the same moment, keep the spec's mechanics and add this lighting on top.

## THE RULE
The entire site is a dark stage. In every frame, the activity happening RIGHT NOW
plays inside a cinematic spotlight; everything else on screen drops to low brightness.
Past artifacts (docked cards, status rows, finished widgets) stay visible but dimmed —
present-tense action is always the brightest thing on the page.

## LIGHT SPEC
- Pool: soft-edged warm light (tint from #F4F1EC toward amber #FF9E2C at the falloff
  rim — never an orange flood; palette rules §1.2 still apply).
- Contrast: inside pool = full exposure; outside ≈ 15–25% brightness (silhouettes
  readable, never crushed to pure black).
- Quality: subtle volumetric cone + dust in beam (desktop only), penumbra ≥ 0.4,
  film grain visible inside the pool.
- Motion: the spotlight TRACKS the active subject with a slight eased lag (~0.15 lerp),
  like a human operator following the actor. It resizes per beat: wide for travel,
  tight for objects. Optional: pool tightens slightly during fast scroll (velocity-linked).
- Fully scroll-deterministic and reversible, like everything else (§1.5).

## TEXT RULE
All narrative copy and UI labels live in the DARKER zones, outside the pool, set in
#F4F1EC/#9A958C for readability on near-black. EXCEPTION — when text itself is the
actor (Frame 6 Approve chip, Frame 11 line, Frame 12 kinetic type), the spotlight is
ON the text and everything else goes dark.

## CAMERA RULE
Each beat may take the most cinematic angle it needs — low hero, over-shoulder,
top-down, slow orbit, push-in — with the spotlight composed into the shot, PROVIDED
the continuity hard rules in §5.1 (F1→F2, F8→F9→F10 continuous shots) still hold.

## IMPLEMENTATION
One SpotlightDirector, driven by the master timeline: each Scene exposes
spotlightTarget(localProgress) → { position, radius, intensity }. The Director drives
BOTH the 3D light (three.js SpotLight + drei volumetric cone in R3F) AND a synced DOM
dimming layer (radial-gradient brightness mask over OverlayRoot) so canvas and HTML
windows dim as one world. Mobile/perf: no volumetric cone — radial mask only; add
"volumetric cone" to the top of the degrade order (§1.8). Reduced-motion: static pool
per scene, no tracking.

## PER-FRAME SPOTLIGHT MAP
- F1  pool follows the falling page; hero copy sits in darkness on the right
- F2  tight pool on the landing/morph/wake-up; road rim falloff, low street angle
- F3  pool travels WITH the walking figure; buildings rise half-lit at the pool's rim
      and fall back into darkness behind him
- F4  pool narrows onto the phone, then the call card; figure dims as card takes light
- F5  spotlight on the glass windows — transcript + dashboard are the lit stage;
      docked call card at ~40%, all else dark
- F6  the tightest pool of the site, on the Approve chip alone (amplifies the specced
      emptiness); package card dim at left
- F7  the tornado IS the light source (per spec) — spotlight merges into the vortex
      glow + floor pool; camera may slow-orbit it
- F8  wide ellipse pool covering figure + analytics board; event feed at the dim edges
- F9  pool on eagle + mini-site; board dimmed to 60% left; when the iris SNAPS to the
      broken panel, the pool snaps with it — same easing, same beat
- F10 the desk lamp is the spotlight (diegetic); orb in the pool's edge; blueprint wall
      dim, brightening zone-by-zone as it fills
- F11 pool on the standing agent against the skyline; the typed line stays lower-third
      in darkness
- F12 spotlight on the kinetic type itself (text-as-actor exception), then narrows to
      the landed glyph + CTA

## QA ADDITIONS (append to §5.5)
- [ ] Stop at any random point: spotlight is on the correct subject, correctly sized
- [ ] All dark-zone text passes contrast on #0A0A0B
- [ ] Spotlight tracking reverses cleanly when scrolling up
- [ ] DOM dim layer and 3D light never desync at scene boundaries
