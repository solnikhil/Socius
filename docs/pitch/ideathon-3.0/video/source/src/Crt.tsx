/** 90s television: CRT power on/off, scanlines, RGB fringing, VHS grain + tracking band, VCR OSD, channel-change static. */
import React from "react";
import { AbsoluteFill, random, useCurrentFrame } from "remotion";
import { ramp, E, keys } from "./lib/anim";
import TL from "./timeline.json";

const STATIC_AT = [TL.cues.converge, TL.cues.toApp, TL.cues.toTiles, TL.cues.toWall, TL.cues.implode];
const burst = (f: number) => STATIC_AT.reduce((m, s) => Math.max(m, f >= s && f < s + 5 ? 1 - (f - s) / 5 : 0), 0);

const VCR: React.CSSProperties = {
  position: "absolute",
  fontFamily: "Menlo, 'Courier New', monospace",
  fontWeight: 800,
  fontSize: 34,
  letterSpacing: "0.06em",
  color: "#E9FFE9",
  textShadow: "0 0 8px rgba(160,255,170,.8), 2px 0 0 rgba(255,0,60,.6), -2px 0 0 rgba(0,180,255,.6)"
};

export const Crt: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const f = useCurrentFrame();
  const end = TL.durationInFrames;
  // power on: thin bright line -> full picture; power off: collapse to a line, then a dot
  const on = ramp(f, 0, 9, E.out);
  const offY = ramp(f, end - 12, end - 6, E.in);
  const offX = ramp(f, end - 6, end - 1, E.in);
  const sy = Math.max(0.004, on * (1 - offY * 0.996));
  const sx = 1 - offX * 0.99;
  const b = burst(f);
  const C = TL.cues;
  // TV strength: full in the intro and on channel changes, light while the product is on screen
  const base = keys(f, [0, C.drop + 10, C.appReady, C.toTiles - 4, C.toTiles + 30, C.toWall + 30, C.implode, C.closeHit + 20, TL.durationInFrames], [1, 0.85, 0.22, 0.22, 0.2, 0.2, 0.5, 0.3, 0.3]);
  const tv = Math.min(1, base + b * 0.9);
  const green = tv;
  const jitter = b > 0 ? (random(`j${f}`) - 0.5) * 40 * b : (random(`jj${f}`) - 0.5) * 1.2 * tv;
  const flicker = 1 - random(`fl${f}`) * 0.03 * tv;
  const secs = Math.floor(f / 30);
  const tc = `0:00:${String(secs).padStart(2, "0")}`;
  const ch = (() => {
    const idx = STATIC_AT.findIndex((s) => f >= s && f < s + 30);
    return idx >= 0 ? `CH 0${idx + 2}` : null;
  })();

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <filter id="rgbsplit" colorInterpolationFilters="sRGB">
          <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
          <feOffset in="r" dx={0.6 + 2.4 * tv + b * 10} dy="0" result="r2" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="bb" />
          <feOffset in="bb" dx={-0.6 - 2.4 * tv - b * 10} dy="0" result="b2" />
          <feBlend in="r2" in2="g" mode="screen" result="rg" />
          <feBlend in="rg" in2="b2" mode="screen" />
        </filter>
      </svg>
      {/* the tube */}
      <AbsoluteFill style={{ transform: `scale(${sx}, ${sy})`, filter: `brightness(${(1 + (1 - on) * 3 + offY * 2) * flicker})` }}>
        <AbsoluteFill style={{ borderRadius: 46, overflow: "hidden", transform: `translateX(${jitter}px)` }}>
          <AbsoluteFill style={{ filter: `url(#rgbsplit) contrast(${1 + 0.1 * green}) sepia(${0.75 * green}) hue-rotate(${68 * green}deg) saturate(${1 + 0.5 * green}) brightness(${1 + 0.06 * green})` }}>{children}</AbsoluteFill>
          {/* grain */}
          <svg width="1920" height="1080" style={{ position: "absolute", inset: 0, opacity: 0.03 + 0.11 * tv + b * 0.75, mixBlendMode: "screen" }}>
            <filter id={`n${f}`}><feTurbulence type="fractalNoise" baseFrequency={b > 0 ? 0.9 : 0.75} numOctaves="2" seed={f} /><feColorMatrix type="saturate" values="0" /></filter>
            <rect width="100%" height="100%" filter={`url(#n${f})`} />
          </svg>
          {/* scanlines */}
          <AbsoluteFill style={{ backgroundImage: `repeating-linear-gradient(180deg, rgba(0,0,0,${0.08 + 0.22 * tv}) 0px, rgba(0,0,0,${0.08 + 0.22 * tv}) 1px, transparent 1px, transparent 4px)` }} />
          <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(80,255,140,.10), rgba(20,90,40,.18))", mixBlendMode: "screen", opacity: green }} />
          {/* tube curvature + vignette */}
          <AbsoluteFill style={{ boxShadow: "inset 0 0 180px 40px rgba(0,0,0,.85), inset 0 0 30px 8px rgba(0,0,0,.9)", background: "radial-gradient(ellipse at 50% 45%, rgba(255,255,255,.05), transparent 55%)" }} />
          {/* VCR on-screen display */}
          <div style={{ ...VCR, left: 70, top: 52, opacity: f < 60 || (f > 60 && Math.floor(f / 15) % 2 === 0 && f < 120) ? 1 : 0.0 }}>PLAY ▶</div>
          <div style={{ ...VCR, right: 70, bottom: 52, fontSize: 28 }}>SP {tc}</div>
          {ch ? <div style={{ ...VCR, right: 70, top: 52, fontSize: 40 }}>{ch}</div> : null}
          {f > end - 40 ? <div style={{ ...VCR, left: 70, top: 52 }}>■ STOP</div> : null}
        </AbsoluteFill>
      </AbsoluteFill>
      {/* power-on / power-off glow line */}
      <AbsoluteFill style={{ display: "grid", placeItems: "center", pointerEvents: "none" }}>
        <div style={{ width: 1920 * sx, height: 4, background: "#fff", boxShadow: "0 0 40px 12px rgba(200,230,255,.9)", opacity: Math.max(1 - on, offY) * (f < 9 || f > end - 12 ? 1 : 0) }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
