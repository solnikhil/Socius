import { Easing, interpolate, random, spring } from "remotion";

export const E = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  soft: Easing.bezier(0.45, 0, 0.2, 1),
  in: Easing.bezier(0.7, 0, 0.84, 0),
  back: Easing.bezier(0.34, 1.56, 0.64, 1)
};

export function ramp(f: number, a: number, b: number, easing: (t: number) => number = E.out) {
  return interpolate(f, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });
}

export const mix = (t: number, a: number, b: number) => a + (b - a) * t;

export function keys(f: number, frames: number[], values: number[], easing = E.inOut) {
  return interpolate(f, frames, values, { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });
}

/** macOS-style spring (snappy, slight overshoot). Returns 0 before `at`. */
export function spr(f: number, at: number, cfg: { damping?: number; stiffness?: number; mass?: number } = {}) {
  if (f < at) return 0;
  return spring({ frame: f - at, fps: 30, config: { damping: 14, stiffness: 170, mass: 0.9, ...cfg } });
}

export function typed(text: string, f: number, start: number, end: number) {
  const n = Math.round(interpolate(f, [start, end], [0, text.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return text.slice(0, n);
}

export function streamed(text: string, f: number, start: number, end: number) {
  const words = text.split(" ");
  const n = Math.floor(interpolate(f, [start, end], [0, words.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return words.slice(0, n).join(" ");
}

export const rnd = (seed: string | number) => random(seed);
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
