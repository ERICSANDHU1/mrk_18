/* Narrator track script — master spec ADDENDUM §1.11 (LOCKED).
   inAt/outAt are fractions of THAT frame's local progress. `gradient` is the
   single phrase (≤3 words) that takes the molten→amber gradient. position picks
   the dark-zone corner. F11 and F12 are intentionally silent (no entries). */

export type NarratorLine = {
  scene: number; // 0-based scene index
  text: string;
  gradient?: string; // phrase within text to render with the brand gradient
  inAt: number;
  outAt: number;
  position: "lower-left" | "lower-right" | "upper-left" | "upper-right" | "below";
};

export const NARRATOR: NarratorLine[] = [
  { scene: 0, text: "This is your marketing brief.", gradient: "brief", inAt: 0.08, outAt: 0.3, position: "lower-left" },
  { scene: 0, text: "Watch what it becomes.", inAt: 0.35, outAt: 0.7, position: "lower-left" },

  { scene: 1, text: "It doesn't stay paper for long.", inAt: 0.25, outAt: 0.6, position: "upper-left" },
  { scene: 1, text: "Your CMO just woke up.", gradient: "woke up", inAt: 0.75, outAt: 0.95, position: "lower-right" },

  { scene: 2, text: "Every step builds your marketing. You're only scrolling.", gradient: "scrolling", inAt: 0.2, outAt: 0.6, position: "upper-right" },

  { scene: 3, text: "You don't call it. It calls you.", gradient: "It calls you", inAt: 0.2, outAt: 0.4, position: "lower-left" },
  { scene: 3, text: "Your scroll just answered.", inAt: 0.45, outAt: 0.6, position: "lower-left" },

  { scene: 4, text: "It's researching your market — live.", gradient: "live", inAt: 0.05, outAt: 0.35, position: "below" },
  { scene: 4, text: "Now it's building: ads, captions, campaigns.", inAt: 0.45, outAt: 0.75, position: "below" },

  { scene: 5, text: "A full campaign. Your only job: one tap.", gradient: "one tap", inAt: 0.6, outAt: 0.9, position: "lower-left" },

  { scene: 6, text: "Approved. Launching everywhere at once.", gradient: "everywhere", inAt: 0.15, outAt: 0.5, position: "upper-left" },

  { scene: 7, text: "Not promises. Numbers — moving right now.", gradient: "Numbers", inAt: 0.35, outAt: 0.7, position: "lower-left" },

  { scene: 8, text: "It guards your website while you sleep. 2 AM included.", gradient: "sleep", inAt: 0.55, outAt: 0.85, position: "lower-left" },

  { scene: 9, text: "Every night it studies today. Tomorrow it's sharper.", gradient: "sharper", inAt: 0.25, outAt: 0.6, position: "upper-left" },
  // scene 10 (F11) and scene 11 (F12): SILENT by spec — no entries.
];
