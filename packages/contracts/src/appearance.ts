// Zod-free so the web app can list the choices without bundling the schemas.
// Order matters: older bots without an appearance pick their shape by name hash.
export const BOT_SHAPES = ["round", "squircle", "blob", "hex", "wide"] as const;
export const BOT_EYES = [
  "slant",
  "dots",
  "pupils",
  "cyclops",
  "sleepy",
] as const;
export type BotShape = (typeof BOT_SHAPES)[number];
export type BotEyes = (typeof BOT_EYES)[number];
/** How a bot looks in the app. Private to the instance; never part of a template. */
export interface BotAppearance {
  shape: BotShape;
  eyes: BotEyes;
}
