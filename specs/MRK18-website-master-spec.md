# MRK18 — "See How Simple It Was"
## Master Build Specification · Scroll-Driven 3D Story Landing Page
**Version 1.0 (LOCKED) · 13 June 2026 · All 12 frames approved by founder**

---

## 0. HOW TO USE THIS DOCUMENT

- **Section 1 (Global System) is mandatory context.** When prompting a model to build any single frame, ALWAYS paste Section 1 + that frame's section together.
- Recommended prompt pattern: `[Section 1] + [Frame N] + "Build Frame N as a Scene component following the architecture in Section 5."`
- Every frame in Section 2 is self-contained: **Story beat → Scroll physics → Visuals → Tech → Exit transition.**
- Section 3 = asset inventory. Section 4 = copy deck (all on-screen text, including the full Frame 5 call script). Section 5 = build order + architecture + QA.
- Nothing here is optional unless marked `OPTIONAL`. Locked decisions are non-negotiable. **This is a strict guideline.**

---

## 1. GLOBAL SYSTEM (LOCKED — applies to every frame)

### 1.1 Stack
React 18 + TypeScript + Vite · three.js + @react-three/fiber (R3F) + drei · @react-three/postprocessing · Framer Motion (all DOM/UI animation) · Lenis (smooth scroll) · zustand (state). One page, one fixed full-viewport canvas, one DOM overlay root.

### 1.2 Brand palette (STRICT)
| Token | Hex | Use |
|---|---|---|
| `bg` | `#0A0A0B` | page background, near-black |
| `surface` | `#141416` | charcoal panels, clothing, buildings |
| `text` | `#F4F1EC` | warm off-white, all primary text + wireframes |
| `muted` | `#9A958C` | secondary text, gridlines, labels |
| `molten` | `#FF6A00` | gradient stop 1 |
| `amber` | `#FF9E2C` | gradient stop 2 |
| `ember` | `#E0490E` | gradient stop 3 |
| `gold` | `#F2C879` | sparing highlight only |

**Rules:**
1. ~90% of every frame stays black/charcoal — orange must read expensive, never decorative.
2. Orange appears ONLY as molten→amber→ember **gradients** (data fills, fire, seams, light), never flat fills — except tiny status dots.
3. Explicitly banned: purple/pink "AI-product" palette, neon cyan, flat saturated fills.
4. The single exception to 90/10: Frame 10's blueprint fill, where orange growth IS the narrative payoff.

### 1.3 Cinematic grade (every frame)
Subtle animated film grain · vignette · hinted anamorphic flare on hot points (phone screen, vortex core, eagle iris) · slight handheld camera noise where specified. Post-processing chain: clamped bloom + grain + vignette (+ radial motion blur in Frame 7 only).

### 1.4 Character (LOCKED)
Matte humanoid with **sculpted facial architecture** — defined brow/nose/jaw planes, **no eyes, no skin detail** — wearing simple fitted clothing: matte charcoal `#141416` fabric with **thin molten-orange emissive seam lines**. Premium-abstract, never uncanny. Same model used in Frames 2, 3, 4, 8, 10, 11.

### 1.5 Scroll rules (the engine)
- Lenis smooth scroll → master progress `g ∈ [0,1]` across total **~4350vh** + smoothed velocity `v`.
- **Position drives WHERE, velocity drives HOW VIOLENTLY:** every animation is a deterministic function of scene-local progress (scroll back = perfect reverse; no runtime RNG — randomness is seeded/baked). `|v|` (lerp-smoothed ≈0.1, clamped) multiplies intensity: tumble, flutter, spin, blur.
- All scenes are pinned; lengths per frame below. Calibrate so one full user "scroll" ≈ 100–120vh.

### 1.6 Liquid glass recipe (all UI)
`backdrop-filter: blur(24px)` · fill `rgba(20,20,22,0.55)` · 1px inner stroke `rgba(244,241,236,0.14)` · faint orange gradient edge-light · soft drop glow. **All narrative UI is real DOM (HTML/SVG)** — crisp at any DPR, selectable, accessible. Never render UI text inside the canvas.

### 1.7 Accessibility & fallbacks
`prefers-reduced-motion` → static storyboard mode (each scene shown in final state, simple fades between) · all text is real DOM with aria labels · keyboard scrolling works · after the final pin, normal document flow resumes (footer, SEO content).

### 1.8 Performance budget
60fps desktop / 40+fps mid-tier mobile · DPR clamp 1–1.75 · ≤150 draw calls per scene (instancing mandatory for buildings, particles, orb shards, logo tiles) · particles ≤6k desktop / ≤2k mobile · textures ≤2048² · degrade order when frame budget exceeded: radial blur → bloom → particle count → grain.

### 1.9 Scene index
| # | Frame | Pin length | Core mechanic | Exits to |
|---|---|---|---|---|
| 1 | The Falling Page | 300vh | fall = scroll position; velocity = tumble/flutter | camera tilts down to road |
| 2 | Landing & Awakening | 250vh | paper→human fold-morph + scrubbed stand-up | first step, side-on camera |
| 3 | The Walk | 400vh | walk-cycle scrub; instanced city rises in parallax | over-shoulder push-in |
| 4 | The Call | 350vh | "CMO is calling" card; scroll performs the swipe | call card docks left |
| 5 | Live Call Intelligence | 600vh | Act 1 speech→widgets · Act 2 speech→deliverables | "Sending for approval" |
| 6 | Call Ends → Approve | 200vh | dashboard docks; lone Approve chip | chip dissolves to embers |
| 7 | Platform Tornado | 400vh | logos in vertical vortex; velocity feeds the storm | logos settle into status row |
| 8 | Ads Are Live | 450vh | figure rebirth + scroll-scrubbed live data | board drifts left |
| 9 | Eagle Eye | 350vh | wireframe eagle scans mini-site; catches anomaly | eagle banks away; board shrinks |
| 10 | The Agent at Work | 500vh | board→laptop; orb spins; blueprint fills with color | laptop closes, agent stands |
| 11 | "Learned from yesterday" | 250vh | room dissolves; typed line; hero hold | skyline lights stream to camera |
| 12 | Finale | 300vh | kinetic type; paper callback; CTA | normal flow: footer |
| | **Total** | **~4350vh** | | |

---

## 2. THE TWELVE FRAMES (LOCKED SPECS)

---

### FRAME 1 — The Falling Page (hero)

**Story beat:** A single sheet — a marketing brief — slips in from the top-left and falls. It's the seed that becomes your AI CMO in Frame 2.

**Scroll physics**
- Scene pinned for ~300vh. Fall progress = scroll position, so fall speed is *exactly* proportional to scroll speed: scroll fast → it plummets, stop → it freezes mid-air, scroll up → it rises back.
- Scroll **velocity** (from Lenis) separately drives tumble rate, paper flutter, and a touch of motion blur — fast scrolling feels violent, slow feels graceful.

**Visuals**
- The page: an R3F subdivided plane with vertex-shader flutter, soft curl + drop shadow. Face printed with MRK18 logo + faint brief text, so close passes read as "a marketing brief."
- Path: top-left entry → lazy S-curve toward lower-center, tumbling on two axes like a falling leaf. Never a straight drop.
- Backdrop: `#0A0A0B` near-black, one soft light shaft, fine film grain. Liquid-glass navbar floats on top.
- Copy (HTML overlay, right side): **"Meet your AI CMO"** + one-liner + animated scroll cue. Parallaxes up and fades by 80% of the scene.

**Tech:** fixed full-viewport R3F canvas · Lenis + scroll-mapped timeline · Framer Motion for HTML copy · DPR clamp · `prefers-reduced-motion` → static hero.

**Exit → Frame 2:** in the last 10%, camera tilts down, an asphalt road fades in from below, and the page's shadow grows on it. The landing itself opens Frame 2 — no hard cut.

---

### FRAME 2 — Landing & Awakening

**Story beat:** The brief hits the asphalt — and gets up. Your marketing stops being paperwork and becomes someone who works for you.

**Scroll physics** (pinned ~250vh, three scrubbed sub-beats — scroll back and everything reverses):
- **0–25% Touchdown:** page settles on the road, faint dust puff, camera drops from above to street level. Low ember rim-light rakes across the asphalt.
- **25–70% The Morph:** the page folds origami-style — crease lines ignite with the molten→amber gradient like burning edges — and at peak fold a dissolve shader swaps paper mesh → humanoid mesh. The swap is invisible; paper texture lingers on the body, then fades.
- **70–100% Wake-up:** the figure lies on the road, stirs, pushes up to its feet — a single stand-up animation clip whose playhead = scroll position.

**Character:** per §1.4 — matte humanoid, sculpted facial architecture (brow/nose/jaw planes, no eyes/skin detail), fitted charcoal clothing with thin molten-orange seam lines.

**Visuals:** `#0A0A0B` sky, charcoal road, faint warm-white lane markings. The *only* orange: burning creases, the figure's seams, rim light. Grain + vignette hold the cinematic grade.

**Tech:** two meshes + fold/dissolve shader (cheaper and better-looking than true cloth sim) · stand-up clip via drei `useAnimations` with clip time = scroll progress · same canvas, camera driven by the master timeline.

**Exit → Frame 3:** the figure takes its first step; camera pulls back into a side-on tracking shot, road stretching right — straight into the walk.

---

### FRAME 3 — The Walk (the city builds itself)

**Story beat:** The agent walks; the world assembles around it. Every step raises infrastructure — your marketing operation taking shape in the background while you do nothing but scroll.

**Scroll physics** (pinned ~400vh — the longest "travel" scene):
- **Walk = scroll.** The walk-cycle clip is scrubbed by scroll: scroll speed = stride speed. Stop mid-stride and he freezes mid-step; the user literally walks him across the screen.
- **Traversal:** figure's x-position maps left → right across the scene while the road treadmills beneath — half real movement, half background motion, so he visibly crosses the viewport.
- **City rise:** buildings grow out of the ground in staggered parallax bands tied to scroll progress: thin warm-white **wireframe blueprint → extrude → solid charcoal mass** with sparse amber-lit windows. Far band rises first, near band last — depth builds front-to-back.

**Visuals:** 3–4 parallax depth bands, varied silhouettes (towers, low blocks, one billboard carrying a faint MRK18 glyph); haze layers between bands; a single ember glow line on the horizon. Windows are the only orange — scattered, sparing, expensive. Slight handheld camera noise.

**Tech:** instanced building meshes with per-instance rise delays (hundreds of buildings, one draw call) · walk clip scrub via `useAnimations` · side-on dolly camera on the master timeline · fog for the haze bands.

**Exit → Frame 4:** nearing the right edge he decelerates (walk blends to idle), camera pushes in over his shoulder as his hand reaches for his pocket — phone screen already glowing warm inside it.

---

### FRAME 4 — The Call ("CMO is calling")

**Story beat:** The agent doesn't wait to be asked — it makes the call. Your scroll answers it.

**Scroll beats** (pinned ~350vh):
- **0–20% Phone out:** over-the-shoulder push-in; hand draws the phone from the pocket (clip scrub). The screen is the brightest object on the page — warm glow on the jaw planes of the face.
- **20–40% The pop:** one mini-scroll later, a liquid-glass call card scales up center-screen: MRK18 flame-glyph avatar, **"CMO is calling…"**, a pulsing molten-orange ring, swipe track at the bottom.
- **40–55% The swipe — in real time:** the accept knob's position is bound to scroll progress. *The user's scroll physically performs the swipe* — they answer the call themselves. On full swipe: connect pulse, ring snaps to solid amber.
- **55–80% Connected:** call timer starts ticking (real elapsed time), waveform bars dance. The figure dissolves — particles drift upward with ember sparks — his job here is done.
- **80–100% Dock:** the call card shrinks and glides to a left-side rail, still live (timer running, waveform breathing). Main stage clears to near-pure `#0A0A0B`.

**Visuals:** the card is true liquid glass per §1.6. Background dims so the card owns the frame. Everything else stays black.

**Tech:** card + swipe = HTML/Framer Motion overlay synced to the same Lenis timeline as the canvas · character dissolve = particle shader on the mesh · timer/waveform = live JS, not baked video.

**Exit → Frame 5:** the docked card holds the left rail; a second, much larger glass window slides in from the right — the live call transcript. The "screen era" of the story begins.

---

### FRAME 5 — Live Call Intelligence → Live Production (two acts)

**Story beat:** You *hear* the CMO think. Every sentence it speaks turns into a research artifact — then into actual creative work — before you're ever asked to approve anything.

**Layout:** call card holds the left rail (timer ticking). Main stage = a large liquid-glass window, split: transcript stream on the left half, dashboard canvas on the right half that starts empty and fills up.

**Scroll beats** (pinned ~600vh — the longest scene):

**ACT 1 — Research (0–45%):**
- **Transcript:** word-by-word typewriter rendering bound to scroll. Two voices — **CMO** (amber speaker chip) and **FOUNDER** (off-white chip). Scroll back = words un-type.
- **Speech → widgets:** each CMO claim materializes as a dashboard module the moment it's "spoken":
  - "Your buyers are 25–34 founders in metros" → audience donut draws itself
  - "Competitors put ~60% into Meta" → competitor bar chart rises
  - "I'd split your budget 50/30/20" → allocation cards flip in
  - "Expected CPL ~₹140" → KPI counter ticks up from 0
- Widgets assemble with a draw-on effect (SVG paths tracing, bars growing, counters rolling) — never just fading in. A thin **"LIVE · researching…"** pill pulses at the window top.

**ACT 2 — Production (45–100%):** the CMO says *"Building your campaign now —"* and the pill flips to **"LIVE · creating…"**. The dashboard transforms from analysis into deliverables, each assembling as it's spoken:
- **Ad creatives** — 2–3 ad mockups render in like polaroids developing: image area sweeps in, headline types over it, CTA button pops last. Story + feed formats.
- **Campaign structure** — a tree card grows: Campaign → 2 ad sets → ads, connector lines drawing themselves.
- **Designs & templates** — a fan of template thumbnails spreads out like a dealt hand of cards, each in brand black/orange.
- **Captions** — a caption card types 2 variants with hashtags; an A/B badge stamps on.
- Cards stack into a horizontal **deliverables rail** that slides left as new ones arrive — by scene end you're looking at a finished campaign package, not charts.

**Visuals:** glass window on `#0A0A0B`; charts in off-white strokes with molten→amber gradient *fills only on the data*, charcoal gridlines — embers on black glass. Deliverable cards glow slightly *warmer* than research widgets: the creative work literally runs hotter than the analysis.

**Tech:** transcript + widgets = HTML/SVG with Framer Motion (crisp, accessible, copyable) · scroll-scrubbed master timeline shared with canvas · ad mockups are real DOM · rail position scrubbed by scroll · full dialogue script in §4.3.

**Exit → Frame 6:** the CMO's last line: *"Sending this to you for approval."* Waveform flatlines, timer stops — the call ends on the next scroll, package ready.

---

### FRAME 6 — Call Ends → One Tap: Approve

**Story beat:** The work is done; the ask is tiny. A whole campaign, reduced to one glowing word. This is MRK18's entire pitch in a single UI element.

**Scroll beats** (pinned ~200vh — deliberately short, a held breath):
- **0–30% Hang up:** the call card's waveform flatlines, timer freezes, card dims to charcoal and slides off the left rail. *Call ended · 04:32* fades out with it.
- **30–60% The shift:** the deliverables dashboard glides left into the vacated call-card slot, scaling down into a neat "campaign package" card — ad thumbnails, structure tree, and captions visibly stacked inside it like a closed folder.
- **60–100% The chip:** center-stage, alone on pure `#0A0A0B`: a small liquid-glass chip materializes — **"Approve"** — with a slow-breathing molten→amber gradient ring. Under it, one muted line: *Campaign ready · 1 tap to launch.* The chip subtly leans toward the cursor (magnetic hover) — it *wants* to be pressed.

**Visuals:** maximum emptiness — the most negative-space frame on the site. One small package card left, one glowing chip center, black everywhere else. The contrast against Frame 5's density is the point: chaos → one button.

**Tech:** all HTML/Framer Motion (dock-and-shrink via shared `layoutId`) · magnetic hover = pointer-tracked transform, disabled on touch · chip pulse = CSS, cheap.

**Exit → Frame 7:** the next scroll "presses" it — the chip flares, dissolves into ember particles, and those particles become the seeds of the platform tornado.

---

### FRAME 7 — The Platform Tornado

**Story beat:** One tap detonates into distribution. Your campaign tears through every channel at once — the only violent moment on the site, and it's working *for* you.

**Scroll beats** (pinned ~400vh):
- **0–15% Ignition:** the Approve chip's ember particles spiral upward and multiply — a thin column of sparks forms center-screen.
- **15–70% The tornado:** platform logos — Meta, Instagram, Google, YouTube, LinkedIn, X, WhatsApp — fly in and get **trapped in a vertical vortex: the column runs top-to-bottom of the viewport while the logos revolve horizontally around it**. Scroll speed feeds the storm: faster scroll = tighter spin, logos blur into orange light-trails, camera shakes slightly. Slow down and individual logos become readable as they sweep past the camera.
- **70–100% The settle:** rotation decelerates, the funnel widens and dissolves; each logo breaks orbit and glides to the screen edges, shrinking into a quiet status row at the top — each with a tiny amber "live" dot. The storm becomes order.

**Visuals:** logos as flat white glyphs on small charcoal glass tiles (consistent, license-safe, on-palette); the vortex core is a molten→ember gradient light column; particle dust orbits with them. Background pure `#0A0A0B` — the tornado is the only light source, casting a faint glow pool on the "floor."

**Tech:** the one *true 3D set-piece for R3F*: logo tiles on parametric helix paths (angle = scroll progress × velocity boost) · instanced particles · post-processing bloom (clamped) + radial motion blur at peak speed · velocity from Lenis drives spin multiplier · reduced-motion = logos fade into the status row, no storm.

**Exit → Frame 8:** as the last logo docks, the floor glow brightens — and the figure rises from the ground beneath it, reborn where the storm stood.

---

### FRAME 8 — Ads Are Live

**Story beat:** The storm leaves silence — then proof. The agent returns to present a wall of live numbers. Not promises: performance.

**Scroll beats** (pinned ~450vh):
- **0–20% Rebirth:** the figure rises from the floor glow where the tornado stood — same dissolve shader as Frame 4, reversed: ember particles converge downward into the silhouette, which solidifies and straightens up.
- **20–35% The reveal:** he raises a hand; a wide liquid-glass analytics screen unfolds center-stage behind him (panels concertina open left-to-right). Across its top, a banner stamps in: **● ADS ARE LIVE** — amber dot pulsing like a recording light.
- **35–90% Living data:** every chart on the board *changes as you scroll* — the "data is moving right now" illusion:
  - line chart of impressions draws forward, then extends with each scroll
  - CPL counter ticks **down** while conversions tick **up**
  - platform bars (from the Frame 7 status row) reshuffle ranks live
  - a small feed logs events: *"Lead from Mumbai · ₹118"*, *"Creative B outperforming +22%"*
  - scroll back and the data rewinds — time-scrubbing the campaign.
- **90–100% Step back:** the figure walks off-frame right; the screen begins drifting left.

**Visuals:** charts in off-white strokes, data fills in molten→amber gradient only; charcoal gridlines; the figure stands as a dark silhouette *in front of* the glowing board — hero shot of the whole site. Grain + vignette hold.

**Tech:** charts = SVG/Framer Motion scrubbed by scroll (deterministic, reversible — no RNG, so rewind works) · event feed = staggered list keyed to progress · figure reuses rise clip + particle shader · screen stays HTML for crispness.

**Exit → Frame 9:** the board glides to the left half of the stage and compresses — clearing the right side for something that's been watching all along.

---

### FRAME 9 — Eagle Eye (it never sleeps)

**Story beat:** While you read this, something is circling above your website. Nothing gets past it — and when something breaks, you hear about it before your customers do.

**Layout:** the analytics board (from Frame 8) sits compressed on the left, still alive but dimmed to 60%. The right two-thirds belong to the eagle.

**Scroll beats** (pinned ~350vh):
- **0–25% Formation:** particles drift up from the board and assemble into an **eagle of thin off-white wireframe lines** — wings spread, hovering with a slow 2–3px float. Its eye is the only solid element: a molten-amber iris with a slit aperture. Under it, your website renders as a miniature wireframe city-block (pages as flat panels: home, pricing, checkout).
- **25–55% The watch:** an amber scan-beam sweeps from the eagle's eye across the mini-site panels, page by page, in rhythm with scroll. Wherever it passes, warm-white ✓ status ticks appear. A label fades in: **WATCHING · 24/7** with a small day/night dial cycling.
- **55–80% The catch:** mid-sweep, one panel glitches — the checkout panel flickers, its wireframe sags. The eagle's iris **snaps** to it (aperture tightens, quick head-turn), the beam locks on, and a glass report card shoots from the eagle to the left board's inbox: *"⚠ Checkout load 3.2s → root cause: image payload. Report sent 02:14 AM."*
- **80–100% Calm:** panel heals (wireframe re-straightens, ✓ stamps), iris relaxes, sweep resumes. The point lands: it caught it at 2 AM, you slept.

**Visuals:** eagle = wireframe + sparse particle feathers, never photoreal; the amber eye is the frame's single hot point. Everything else black/charcoal. Slight slow-motion feel on the iris snap — the cinematic beat.

**Tech:** eagle = single rigged low-poly mesh rendered as wireframe in R3F (head-turn + hover = two scrubbed clips) · scan beam = shader plane · mini-site + report card = HTML overlays synced to timeline.

**Exit → Frame 10:** the eagle banks upward out of frame; the left board detaches and begins shrinking toward a point in the darkness — which turns out to be a laptop screen on a desk.

---

### FRAME 10 — The Agent at Work (the learning loop)

**Story beat:** Where does all of this come from? Pull back: the agent has been at a desk the whole time — studying. Every scroll you make, it learns; and what it learns becomes the world.

**Scroll beats** (pinned ~500vh):
- **0–15% The shrink:** the analytics board flies away from camera, shrinking until it *is* a laptop screen on a desk. Camera settles into a wide cinematic desk shot: the agent seated, face planes lit only by laptop glow, a desk lamp pooling warm light, darkness around.
- **15–85% Study & revolve:** above the desk floats a **revolving knowledge orb** — a sphere of orbiting data shards/glyphs. Scroll drives it: **revolution speed rises with scroll speed**, and streams of light motes flow from the laptop screen up into the orb (data being absorbed).
- **The blueprint fill (same span):** behind the desk, a massive wall-sized **blueprint of the Frame-3 city** — thin off-white wireframe elevation. Each full orb revolution "paints" a zone of it: wireframe → charcoal mass → amber windows igniting. Calibrated so **3–4 strong scrolls complete the whole background** — by 85%, the blueprint has become a finished, glowing skyline. Learning, visualized as construction.
- **85–100% Done studying:** the orb's spin eases to a calm idle; the last blueprint zone fills; the laptop screen dims to a single line: *Model updated.*

**Visuals:** depth stack — desk scene (front, dark) → orb (mid, ember) → blueprint wall (back, gradually warming). The background filling with color is the only frame where orange grows beyond 10% — earned, because it's the finale of the learning arc.

**Tech:** board→laptop = camera dolly + scale on the master timeline (one continuous shot, no cut) · orb = instanced shards on orbital paths, spin multiplier from Lenis velocity · blueprint fill = shader mask revealing the colored city texture zone-by-zone, progress-driven · seated/idle clips scrubbed.

**Exit → Frame 11:** the agent closes the laptop — screen light dies — and pushes the chair back to stand. Desk, lamp, orb dissolve into particles. Only the glowing skyline stays.

---

### FRAME 11 — "I've learned more from yesterday's data."

**Story beat:** The quietest frame on the site. No UI, no charts, no storm — just the agent, the skyline it built, and one sentence that explains why it gets better every single day.

**Scroll beats** (pinned ~250vh — slow, deliberate):
- **0–35% The stand:** continuing from Frame 10's exit — the agent rises from the chair (stand clip scrubbed), and as it straightens, the remaining room dissolves: desk, lamp, chair, orb each break into ember particles that drift up and vanish. Camera slowly arcs from side-view to a low frontal hero angle.
- **35–75% The line:** the agent stands centered, a dark silhouette against the glowing skyline it just finished painting. The sentence types itself across the lower third, word by word, scroll-bound: **"I've learned more from yesterday's data."** Large warm off-white type; the word *learned* carries the molten→amber gradient. A thin cursor blinks at the end — it's still thinking.
- **75–100% The hold:** everything stills. Skyline windows shimmer faintly, the agent breathes (subtle idle), the line holds. Negative space does the work — the emotional beat before the punchline.

**Visuals:** three layers only — black foreground, silhouetted agent, amber skyline. The most poster-like frame on the site; it should screenshot perfectly (this IS the shareable still).

**Tech:** stand + idle clips scrubbed · room dissolve reuses the particle shader (fourth use — consistent visual language) · type-on = HTML/Framer Motion, scroll-bound with reduced-motion fallback (fade-in instead).

**Exit → Frame 12:** the skyline's lights begin streaming toward camera as points of light — the world dissolves into pure typography space for the finale.

---

### FRAME 12 — Finale: "See how simple it was…"

**Story beat:** The punchline. Ninety seconds ago a piece of paper fell out of the sky; since then a campaign was researched, built, approved, launched, monitored, and learned from. The site looks the visitor in the eye and says it.

**Scroll beats** (final ~300vh, then the page actually ends):
- **0–25% The warp:** the skyline's window-lights detach and stream past camera as light streaks (gentle starfield warp, not aggressive) — the world dissolves to pure `#0A0A0B`.
- **25–70% The words:** massive kinetic typography assembles one word per scroll-step, each landing with a soft impact and slight letter-spacing settle: **SEE · HOW · SIMPLE · IT · WAS…** — filling the viewport edge-to-edge in warm off-white; *SIMPLE* takes the molten→amber gradient. The trailing "…" types dot-by-dot and keeps blinking.
- **70–90% Full circle:** a familiar object flutters down from the top-left — *the same falling brief from Frame 1* — tumbling once, twice, landing flat at the base of the type. On impact it folds itself into the MRK18 flame-glyph. The loop closes silently; people who notice will grin.
- **90–100% The ask:** beneath the glyph, the only real buttons on the site fade up — primary liquid-glass CTA **"Hire your AI CMO"** (breathing amber ring, magnetic hover) + ghost secondary **"Watch it again ↑"** (smooth-scrolls to top). Minimal footer line below.

**Visuals:** typography is the hero — nothing else on stage except the landed glyph and two buttons. Grain stays; vignette opens slightly so the ending feels lighter than the journey.

**Tech:** word-landing + type-on = Framer Motion scroll-bound · warp = the same particle system, retargeted (fifth reuse) · paper callback reuses Frame 1's mesh + a fold morph · past the pin, normal document flow resumes for footer/SEO content.

---

## 3. ASSET INVENTORY (everything that must exist before/while building)

### 3.1 3D models
| ID | Asset | Spec | Used in |
|---|---|---|---|
| M1 | **Humanoid (rigged)** | Matte material; sculpted facial architecture (brow/nose/jaw planes, NO eyes/skin detail); fitted clothing as part of mesh, charcoal `#141416` with thin emissive molten-orange seam lines; ~15–25k tris; humanoid rig (Mixamo-compatible skeleton) | F2,3,4,8,10,11 |
| M2 | **Paper / brief** | Subdivided plane (≥32×32) for flutter + fold; double-sided; print texture both faces; morph targets for fold states | F1,2,12 |
| M3 | **Building kit** | 6–8 low-poly variants (towers, low blocks) + 1 billboard with MRK18 glyph; emissive window maps; built for instancing | F3,10 (blueprint wall) |
| M4 | **Phone prop** | Simple slab, emissive screen plane | F4 |
| M5 | **Eagle (rigged)** | Low-poly, rendered as wireframe; rig for head-turn + wing hover; separate solid amber iris mesh with aperture blend shape | F9 |
| M6 | **Desk set** | Desk, chair, lamp (warm pool light), laptop (emissive screen plane that receives the board texture) | F10,11 |
| M7 | **Knowledge-orb shards** | 1 glyph/shard mesh, instanced ~200× on orbital paths | F10 |
| M8 | **Platform logo tiles ×7** | Meta, Instagram, Google, YouTube, LinkedIn, X, WhatsApp — flat white official glyphs on small charcoal glass tiles (rounded box + glass material). ⚠ Source glyphs from each platform's official brand kit and follow their usage guidelines | F7,8 (status row) |
| M9 | **MRK18 flame glyph** | 3D version (call avatar, F12 fold target) + SVG version (navbar, favicon, preloader) | F4,12, navbar |

### 3.2 Animation clips (all scrub-safe: clean start/end poses, no root motion unless noted)
| ID | Clip | Notes | Frame |
|---|---|---|---|
| A1 | Lying → stir → stand-up | single continuous clip, scrubbed | F2 |
| A2 | Walk cycle | loops; stride scrub; root motion handled by x-mapping | F3 |
| A3 | Walk → idle blend | deceleration at right edge | F3→4 |
| A4 | Phone draw from pocket | over-shoulder framing | F4 |
| A5 | Idle breathing | subtle loop, reused everywhere the figure stands | F2,4,8,11 |
| A6 | Rise-straighten (rebirth) | pairs with reversed particle converge | F8 |
| A7 | Hand-raise reveal | triggers board unfold | F8 |
| A8 | Walk off-frame | short exit | F8 |
| A9 | Seated study idle | laptop typing micro-motion | F10 |
| A10 | Laptop close → chair push → stand | continuous, scrubbed across F10 exit/F11 start | F10–11 |
| A11 | Hero idle | slower breathing, head slightly raised | F11 |
| E1 | Eagle hover loop | 2–3px float | F9 |
| E2 | Eagle head-snap turn | the "catch"; slight slow-mo feel | F9 |
| E3 | Eagle bank-away exit | upward out of frame | F9 |
| P1 | Paper fold-to-glyph morph | morph-target sequence | F12 (and F2 fold basis) |

**Sourcing route (default):** commission or buy a base humanoid matching §1.4, retarget Mixamo clips for A1–A8, hand-key A9–A11 + eagle clips. Alternative: fully keyframed in Blender. Decide in Phase 2.

### 3.3 Shaders & FX (custom)
| ID | Shader/FX | What it does | Frames |
|---|---|---|---|
| S1 | Paper flutter (vertex) | wind ripple, amplitude from scroll velocity | F1,12 |
| S2 | Fold/dissolve morph | origami fold + burning-crease gradient + cross-mesh dissolve swap | F2,12 |
| S3 | **Particle system (singleton)** | dissolve/converge ember particles — THE connective visual language. Five uses: F4 figure dissolve, F7 ignition, F8 converge-rebirth, F11 room dissolve, F12 warp streaks | F4,7,8,11,12 |
| S4 | Scan beam | volumetric-feel beam plane from eagle iris | F9 |
| S5 | Blueprint color-fill mask | progress-driven zone reveal: wireframe → charcoal → amber windows | F10 |
| S6 | Vortex helix system | parametric helix paths for logo tiles, angle = progress × velocity boost | F7 |
| S7 | Floor glow pool | soft radial gradient under tornado/rebirth | F7,8 |
| — | Post chain | clamped bloom + animated grain + vignette (+ radial blur F7 only, anamorphic flare sprites on hot points) | all |

### 3.4 UI component kit (DOM — liquid glass per §1.6)
Navbar (glyph + wordmark + mini CTA) · call card (avatar, name line, pulsing ring, swipe track + knob, timer, waveform) · transcript window (speaker chips, typewriter lines) · widget modules: audience donut, competitor bars, allocation cards, KPI counter, impressions line chart, platform rank bars, event feed, status row · deliverable cards: ad mockup (story + feed), campaign-structure tree, template fan, caption card with A/B badge · "LIVE ·" pill (researching/creating) · Approve chip (breathing gradient ring, magnetic hover) · campaign package card (closed-folder stack) · eagle report card · WATCHING 24/7 label + day/night dial · banner "● ADS ARE LIVE" · mini-site wireframe panels (home/pricing/checkout) · laptop screen content ("Model updated.") · kinetic type system (word-landing) · CTA primary + ghost secondary · footer · preloader (glyph draw + %) · debug scrubber (dev only).

### 3.5 Textures & 2D
Brief print (logo + faint text lines/charts, both faces) · film grain tile · blueprint wall (wireframe city elevation, ≤2048²) · colored-city emissive version of same · building window emissive maps · glyph sprite sheet (orb shards) · OG/share image (= Frame 11 still) · favicon.

### 3.6 Fonts (default proposal — confirm before Phase 1)
Display/headlines: **Clash Display** or **General Sans** (Fontshare, free for commercial) · data/numbers/labels: **Space Grotesk** or **JetBrains Mono**. Warm off-white `#F4F1EC` everywhere; gradient text only where specified (F11 "learned", F12 "SIMPLE").

### 3.7 OPTIONAL — audio (muted by default, navbar toggle)
Low ambient hum · connect pulse (F4) · storm whoosh rising with velocity (F7) · single soft piano note (F11). Skip entirely for v1 if timeline is tight.

---

## 4. COPY DECK (every word on the site)

### 4.1 Navbar
MRK18 flame glyph + wordmark **MRK18** · right side mini-CTA: **Hire your AI CMO**

### 4.2 Frame 1 — hero
- H1: **Meet your AI CMO**
- Sub: *From brief to live campaign — researched, built, launched, and improving while you sleep.*
- Scroll cue: **Scroll to watch it work** + animated chevron

### 4.3 Frame 5 — THE CALL SCRIPT (full dialogue, line → widget mapping)
Speaker chips: **CMO** (amber) · **FOUNDER** (off-white). Lines type word-by-word, scroll-bound.

**ACT 1 — researching… (0–45%)**
1. **CMO:** "Morning. The overnight scan is done — your market moved a little. Walk you through it?"
2. **FOUNDER:** "Go ahead."
3. **CMO:** "Your buyers: founders and marketing leads, 25–34, in Mumbai, Bengaluru and Delhi NCR." → `[AUDIENCE donut draws]`
4. **CMO:** "Three competitors are active. Almost 60% of their money sits in Meta — search is underpriced this month." → `[COMPETITOR bars rise]`
5. **FOUNDER:** "So where would you put ours?"
6. **CMO:** "Fifty in search, thirty in Meta, twenty in LinkedIn retargeting." → `[BUDGET SPLIT cards flip in]`
7. **CMO:** "On ₹40,000 that forecasts a cost per lead around ₹140 — about 280 leads." → `[FORECAST counter ticks up]`
8. **FOUNDER:** "Okay. Show me the ads."

**ACT 2 — creating… (45–100%)**
9. **CMO:** "Building your campaign now —" → `[pill flips: LIVE · creating…]`
10. **CMO:** "Two ad sets — one for founders, one for marketing leads. Three creatives each, story and feed." → `[STRUCTURE tree grows + AD MOCKUPS develop]`
11. **CMO:** "Captions A and B. A opens with the pain, B opens with the outcome — I'll split-test them automatically." → `[CAPTION card types + A/B badge stamps]`
12. **FOUNDER:** "Looks good. What's next?"
13. **CMO:** "Sending this to you for approval. One tap, and we're live." → `[waveform flatlines → Frame 6]`

### 4.4 Frame 5 — widget & deliverable labels
Pills: **LIVE · researching…** / **LIVE · creating…** · Widgets: AUDIENCE · COMPETITOR SPEND · BUDGET SPLIT · FORECAST · Deliverables: AD CREATIVES · CAMPAIGN STRUCTURE · TEMPLATES · CAPTIONS A/B

Sample ad-mockup copy — headline: **"Marketing runs itself now."** · CTA: **Start free**
Caption A (pain-led): *"A CMO costs ₹60L a year. Yours just built a campaign before breakfast. #AICMO #MRK18"*
Caption B (outcome-led): *"Researched, designed, launched — one tap. Meet your AI CMO. #MRK18"*

### 4.5 Frames 4 & 6 — call + approve
- Call card: **CMO is calling…** · sub: *MRK18 · your AI CMO* · swipe label: *slide to answer* · status: *Connected · 00:00* (live timer)
- End state: *Call ended · 04:32*
- Approve chip: **Approve** · sub: *Campaign ready · 1 tap to launch* · package card label: *Campaign package*

### 4.6 Frame 8 — live board
Banner: **● ADS ARE LIVE** · KPIs: IMPRESSIONS · CPL · CONVERSIONS · Feed lines (loop pool): *"Lead from Mumbai · ₹118"* · *"Creative B outperforming +22%"* · *"Budget shifted to Search +10%"* · *"Lead from Bengaluru · ₹105"*

### 4.7 Frame 9 — eagle
Label: **WATCHING · 24/7** · Report card: *"⚠ Checkout load 3.2s → root cause: image payload. Report sent 02:14 AM."* · Heal stamp: *Resolved ✓*

### 4.8 Frames 10–12 — closing run
- Laptop final line: *Model updated.*
- F11 line: **"I've learned more from yesterday's data."** (gradient on *learned*)
- F12 type: **SEE HOW SIMPLE IT WAS…** (gradient on *SIMPLE*)
- CTA primary: **Hire your AI CMO** · ghost: **Watch it again ↑**
- Footer: *MRK18 — the AI CMO · Built in India · X · LinkedIn · Instagram · mrk18ai@gmail.com*

---

## 5. BUILD ORDER, ARCHITECTURE & QA

### 5.1 Scene-manager architecture

```
<App>
├─ <ScrollRoot>                Lenis wrapper · ~4350vh scroll spacer
├─ <Canvas>  (fixed, full-viewport, single R3F canvas)
│   ├─ <SceneManager>          mounts active scene ± 1 neighbor (lazy + Suspense preload)
│   │   ├─ <F01_FallingPage/> … <F12_Finale/>     one Scene component per frame
│   ├─ <MasterCamera/>         single camera, driven by master timeline
│   ├─ <Particles/>            singleton ember system, retargeted per scene (S3)
│   └─ <PostFX/>               bloom + grain + vignette (+ radial blur in F7)
└─ <OverlayRoot> (fixed DOM layer)
    ├─ <Navbar/>
    ├─ <SceneOverlays/>        per-frame HTML/SVG UI (call card, transcript, boards…)
    └─ <DebugScrubber/>        dev-only: jump/scrub any scene
```

**State:** one zustand store — `{ g, v, activeScene, localProgress }`.
- R3F components read the store inside `useFrame` (no React re-renders).
- DOM components bridge through Framer Motion `MotionValue`s.

**Scene registry** (global-progress fractions, from §1.9 vh — tune freely, keep ratios):
| F1 0–.069 | F2 .069–.126 | F3 .126–.218 | F4 .218–.299 | F5 .299–.437 | F6 .437–.483 |
|---|---|---|---|---|---|
| **F7 .483–.575** | **F8 .575–.678** | **F9 .678–.759** | **F10 .759–.874** | **F11 .874–.931** | **F12 .931–1.0** |

**Hard rules:**
1. Every scene receives only `localProgress ∈ [0,1]` + `velocity` — scenes never read raw scroll.
2. Everything must be a pure function of progress → fully reversible (scroll up rewinds the story).
3. Camera continuity: F1→F2 (tilt-to-road), F8→F9→F10 (board hand-off → laptop) are continuous shots — no cuts; these scene boundaries share camera keyframes.
4. Only active scene ±1 is mounted; scene N+1's assets preload while N plays.
5. The particle singleton (S3) is never duplicated — it's retargeted, keeping the ember language identical site-wide.

### 5.2 Build order (risk-first, reuse flows downstream)
| Phase | Build | Acceptance check |
|---|---|---|
| **0. Foundation** | Scaffold (Vite/TS/R3F/drei/Lenis/Framer Motion/zustand/postprocessing) · ScrollRoot + store · SceneManager + registry · MasterCamera timeline · glass UI kit base · particle singleton · quality manager · DebugScrubber | scrub bar drives a placeholder cube through 12 dummy scenes at 60fps |
| **1. Frame 1** | Paper mesh + S1 flutter + fall path + velocity layer + hero copy + navbar | fall speed visibly proportional to scroll speed; freeze mid-air on stop; reverse works |
| **2. Character pipeline + Frame 2** | M1 humanoid sourced/rigged · A1/A5 clips · S2 fold-morph | paper→human swap invisible at peak fold; stand-up scrubs cleanly both directions |
| **3. Frame 3** | M3 building kit instanced · A2/A3 · parallax bands + fog | hundreds of buildings, one draw call per variant; stride freezes mid-step |
| **4. Frames 4–6** | Call card + swipe-by-scroll · transcript typewriter engine · widget kit (Act 1) · deliverables kit (Act 2) · dock/layoutId moves · Approve beat | full call plays start→finish and rewinds; every line spawns its widget at the right progress point |
| **5. Frame 7** | S6 vortex + logo tiles + bloom/radial blur + settle-to-status-row | storm tightens with fast scroll, readable when slow; settles in order |
| **6. Frames 8–9** | Live-data scrub system (deterministic) · A6/A7/A8 · M5 eagle + E1–E3 + S4 beam · catch sequence | data rewinds when scrolling back; iris snap lands at exactly 55–80% |
| **7. Frames 10–11** | M6 desk set · M7 orb · S5 blueprint fill · A9/A10/A11 · type-on line | board→laptop is one continuous shot; blueprint completes in 3–4 strong scrolls |
| **8. Frame 12 + flow** | Kinetic type · paper callback (P1) · CTAs · footer · SEO/meta/OG | full top-to-bottom run feels continuous; loop callback lands |
| **9. Polish** | Perf pass vs §1.8 · mobile pass · reduced-motion mode · preloader · audio (optional) · QA matrix below | Lighthouse ≥90 perf desktop; all QA boxes ticked |

### 5.3 Mobile strategy
`svh` units, not `vh` · natural touch scroll through Lenis (no scroll-jacking beyond smoothing) · magnetic hover → tap states · simplified scenes: F3 two parallax bands, F7 five logos + half particles, grain off on low-end (degrade order §1.8) · layout: side-docked windows (F5, F9) stack vertically on <768px; deliverables rail becomes swipeable · test on a mid-tier Android, not just iPhone.

### 5.4 Loading strategy
Preloader: flame glyph draws itself + percentage (brand moment, not a spinner) · initial payload <2.5MB: F1 needs only paper mesh + textures + fonts · all other GLBs/textures stream per scene via Suspense preload (scene N plays while N+1 loads) · fonts subset + `font-display: swap`.

### 5.5 QA checklist (every box, every release)
- [ ] Scroll DOWN through all 12 frames — no pops, no z-fighting, transitions continuous
- [ ] Scroll UP through all 12 — every animation reverses correctly (the reversibility law)
- [ ] Stop dead mid-scene at 5 random points — frame is composed, nothing mid-glitch
- [ ] Refresh mid-page — scene restores from scroll position
- [ ] Resize + orientation change mid-scene
- [ ] Touch momentum scroll on iOS Safari + mid-tier Android (svh correct)
- [ ] Keyboard: PgDn/PgUp/space navigate; focus visible on CTAs
- [ ] `prefers-reduced-motion` → static storyboard renders all 12 final states
- [ ] Throttled 4G: preloader → F1 interactive < 4s
- [ ] 60fps desktop / 40fps mobile in F5 (DOM-heaviest) and F7 (GPU-heaviest)
- [ ] Chrome, Safari, Firefox, Edge + iOS Safari
- [ ] All copy matches §4 exactly; no placeholder text shipped
- [ ] OG image, favicon, meta description, title tag present
- [ ] Platform logos = official brand-kit versions, usage guidelines followed

### 5.6 Open decisions (resolve before their phase)
1. Font confirmation (§3.6) — before Phase 1
2. Humanoid sourcing route: commission vs Mixamo-retarget (§3.2) — before Phase 2
3. Ad-mockup imagery (real product shots vs abstract brand art) — before Phase 4
4. Footer links: live social URLs + contact email final — before Phase 8
5. Audio in or out for v1 (§3.7) — before Phase 9

---

*End of master specification · MRK18 "See How Simple It Was" · v1.0 LOCKED*
