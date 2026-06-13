# GLOBAL ADDENDUM §1.11 — THE NARRATOR TRACK (LOCKED) · Frames 1–12

Apply together with MRK18-website-master-spec.md and Addendum §1.10 (Spotlight).
Additive layer: change NO locked decision.

## THE RULE
An unseen storyteller captions the film, live. One short line per beat, TYPED
word-by-word as the user scrolls (scroll back = words un-type). Lines live in the
DARK ZONES (§1.10 text rule) — never inside the spotlight pool, never two lines
on screen at once. A line types in at its beat, holds, and dissolves before the
next beat begins.

## STYLE
Sentence case · 14–16px · letter-spacing 0.06em · muted #9A958C on the dark zone.
Per line, at most ONE word or short phrase (≤3 words) takes the molten→amber
gradient (background-clip text) — marked **bold** below. Subtle 200ms dissolve out.
Mobile: all positions collapse to a bottom-center caption strip above the safe area.
Reduced motion: fade in/out, no typing.

## IMPLEMENTATION
<NarratorTrack/> in OverlayRoot, driven by the master timeline. Data-driven script:
{ frame, text, gradientPhrase, inAt, outAt, position } — typewriter progress =
remap(localProgress, inAt → inAt+0.08), fully deterministic and reversible (§1.5).
Enforce single-active-line. Real DOM text (selectable, accessible).

## THE SCRIPT (inAt/outAt = % of that frame's local progress)
- F1  ① 8–30%   lower-left   "This is your marketing **brief**."
      ② 35–70%  lower-left   "Watch what it becomes."
- F2  ① 25–60%  upper-left   "It doesn't stay paper for long."        (during the morph)
      ② 75–95%  lower-right  "Your CMO just **woke up**."             (as he stands)
- F3  ① 20–60%  upper-right  "Every step builds your marketing. You're only **scrolling**."
- F4  ① 20–40%  lower-left   "You don't call it. **It calls you**."   (while it rings)
      ② 45–60%  lower-left   "Your scroll just answered."             (after the swipe)
- F5  ① 5–35%   below window "It's researching your market — **live**."        (Act 1)
      ② 45–75%  below window "Now it's building: ads, captions, campaigns."   (Act 2)
- F6  ① 60–90%  lower-left   "A full campaign. Your only job: **one tap**."
- F7  ① 15–50%  upper-left   "Approved. Launching **everywhere** at once."
- F8  ① 35–70%  lower-left   "Not promises. **Numbers** — moving right now."
- F9  ① 55–85%  lower-left   "It guards your website while you **sleep**. 2 AM included."
                              (lands together with the 02:14 AM report card — same beat)
- F10 ① 25–60%  upper-left   "Every night it studies today. Tomorrow it's **sharper**."
- F11 — SILENT. Render NO narrator node. The agent's own line owns this frame.
- F12 — SILENT. Render NO narrator node. The kinetic type is the punchline.

## QA ADDITIONS (append to §5.5)
- [ ] Exactly one narrator line max visible at any random scroll stop
- [ ] No narrator line ever intersects the spotlight pool
- [ ] Scroll-up un-types every line cleanly
- [ ] F11 and F12 contain zero narrator elements
- [ ] Gradient phrase rendering matches the bold markers exactly
