/**
 * Socius promo v2: one continuous shot on black. Nothing cuts; shared elements morph between beats:
 * India task chips -> orbit around Baymax -> chat bubble + connected apps in the app window;
 * Baymax -> app avatar; "Socius" wordmark -> sidebar label; app window -> first use-case tile;
 * tiles -> marketplace logo wall; wall -> implodes into Baymax for the end card.
 */
import React from "react";
import { AbsoluteFill, Html5Audio, Img, staticFile, useCurrentFrame } from "remotion";
import * as si from "simple-icons";
import { E, keys, mix, ramp, spr, typed } from "./lib/anim";
import TL from "./timeline.json";
import { Crt } from "./Crt";

const CU = TL.cues;
type Icon = { path: string; hex: string; title: string };
const I = si as unknown as Record<string, Icon>;
type Rect = { x: number; y: number; w: number; h: number };
const lr = (t: number, a: Rect, b: Rect): Rect => ({ x: mix(t, a.x, b.x), y: mix(t, a.y, b.y), w: mix(t, a.w, b.w), h: mix(t, a.h, b.h) });
const sm = (f: number, a: number, b: number) => ramp(f, a, b, E.inOut);
const box = (r: Rect): React.CSSProperties => ({ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h });

const K = {
  panel: "#0D0D10",
  panel2: "#17171C",
  side: "#09090B",
  line: "rgba(255,255,255,.09)",
  text: "#F5F5F7",
  sub: "#A1A1AA",
  dim: "#5E5E68",
  saffron: "#FF8A1F",
  green: "#22C55E",
  red: "#FF453A",
  font: "Inter, -apple-system, 'SF Pro Display', 'Helvetica Neue', 'Kohinoor Devanagari', 'Tamil Sangam MN', sans-serif"
};

/* ------------------------------------------------------------------ atoms */
type Brand = { icon?: Icon; file?: string; text?: string; color?: string };
const Logo: React.FC<Brand & { size: number; radius?: number; flat?: boolean }> = ({ icon, file, text, color, size, radius, flat }) => (
  <div style={{ width: size, height: size, flexShrink: 0, borderRadius: radius ?? size * 0.26, background: "#fff", display: "grid", placeItems: "center", overflow: "hidden", boxShadow: flat ? undefined : "0 8px 24px rgba(0,0,0,.45)" }}>
    {icon ? (
      <svg viewBox="0 0 24 24" width={size * 0.58} height={size * 0.58}><path d={icon.path} fill={`#${icon.hex}`} /></svg>
    ) : file ? (
      <Img src={staticFile(`logos/${file}`)} style={{ maxWidth: size * 0.8, maxHeight: size * 0.64, objectFit: "contain" }} />
    ) : (
      <span style={{ fontWeight: 900, fontSize: size * (text && text.length > 2 ? 0.3 : 0.5), color: color ?? "#111", letterSpacing: "-0.02em" }}>{text}</span>
    )}
  </div>
);

const BaymaxFace: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ width: size, height: size, borderRadius: size * 0.28, background: "linear-gradient(180deg,#fff,#e6eaee)", display: "grid", placeItems: "center", boxShadow: "0 10px 30px rgba(0,0,0,.5)" }}>
    <svg viewBox="0 0 100 60" width={size * 0.72}>
      <line x1="25" y1="30" x2="75" y2="30" stroke="#111" strokeWidth="3" />
      <ellipse cx="25" cy="30" rx="10" ry="11" fill="#111" />
      <ellipse cx="75" cy="30" rx="10" ry="11" fill="#111" />
    </svg>
  </div>
);

const Traffic: React.FC = () => (
  <div style={{ display: "flex", gap: 9 }}>
    {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
  </div>
);

const Cursor: React.FC<{ x: number; y: number; press: number }> = ({ x, y, press }) => (
  <svg style={{ position: "absolute", left: x, top: y, transform: `scale(${1 - press * 0.18})`, transformOrigin: "0 0", filter: "drop-shadow(0 4px 6px rgba(0,0,0,.6))" }} width="32" height="44" viewBox="0 0 20 28">
    <path d="M1 1 L1 22 L6.5 17 L10 26 L13.5 24.5 L10 16 L17 16 Z" fill="#fff" stroke="#000" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

const Title: React.FC<{ t: number; size: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ t, size, children, style }) => (
  <div style={{ fontSize: size, fontWeight: 850, letterSpacing: "-0.045em", lineHeight: 1.02, color: K.text, opacity: t, transform: `translateY(${(1 - t) * 34}px)`, filter: `blur(${(1 - t) * 12}px)`, whiteSpace: "nowrap", ...style }}>
    {children}
  </div>
);
const IndiaWord: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ background: "linear-gradient(90deg,#FF9933 0%,#FFB766 30%,#FFFFFF 50%,#5BD16B 72%,#138808 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{children}</span>
);

/* ------------------------------------------------------------------ Baymax (layered, vector eyes) */
const Baymax: React.FC<{ width: number; tilt?: number; blink?: number; look?: number; bodyOpacity?: number }> = ({ width, tilt = 0, blink = 0, look = 0, bodyOpacity = 1 }) => {
  const s = width / 2000;
  const ry = 29 * (1 - blink * 0.9);
  return (
    <div style={{ position: "relative", width, height: 1720 * s }}>
      <Img src={staticFile("img/baymax-body.png")} style={{ position: "absolute", left: 0, top: 0, width, opacity: bodyOpacity }} />
      <div style={{ position: "absolute", left: 740 * s, top: 20 * s, width: 570 * s, height: 286 * s, transform: `rotate(${tilt}deg)`, transformOrigin: "50% 98%" }}>
        <Img src={staticFile("img/baymax-head-noeyes.png")} style={{ width: "100%", height: "100%" }} />
        <svg viewBox="0 0 570 286" style={{ position: "absolute", inset: 0 }}>
          <g transform={`translate(${look * 14},0)`}>
            <line x1="169" y1="124" x2="383" y2="126" stroke="#14151a" strokeWidth="4.5" />
            <ellipse cx="169" cy="120" rx="28.5" ry={ry} fill="#14151a" />
            <ellipse cx="383" cy="122" rx="28.5" ry={ry} fill="#14151a" />
          </g>
        </svg>
      </div>
    </div>
  );
};
const blinkAt = (f: number) => CU.blinks.reduce((m, b) => Math.max(m, 1 - Math.min(1, Math.abs(f - b) / 3)), 0);
// Baymax stage placement (reveal + close): width 700, head centre at (1309, 574)
const BX = { left: 950, top: 518, w: 700, headX: 1025 * 0.35, headY: 160 * 0.35 };

/* ------------------------------------------------------------------ data */
const CHIPS: { brand: Brand; label: string }[] = [
  { brand: { file: "irctc.svg" }, label: "Tatkal tickets" },
  { brand: { file: "digilocker.svg" }, label: "Your documents" },
  { brand: { file: "upi.svg" }, label: "Bill payments" },
  { brand: { text: "GST", color: "#1B3A8A" }, label: "GST filing" },
  { brand: { text: "अ", color: K.saffron }, label: "22 languages" }
];
const W: Rect = { x: 160, y: 80, w: 1600, h: 920 }; // app window
const AV = { x: 320, y: 214 }; // avatar centre (absolute)
const BUBBLE: Rect = { x: 1060, y: 150, w: 660, h: 64 };
const ROW = (i: number): Rect => ({ x: 180, y: 410 + i * 54, w: 280, h: 44 });
const chipRow = (i: number): Rect => ({ x: 150 + i * 330, y: 650, w: 300, h: 80 });
const orbit = (i: number, f: number): Rect => {
  const a = ((160 - i * 35 + Math.sin(f / 50 + i) * 3) * Math.PI) / 180;
  const cx = 1300 + 470 * Math.cos(a), cy = 600 - 350 * Math.sin(a);
  return { x: cx - 140, y: cy - 36, w: 280, h: 72 };
};

const TILES: { brand: Brand[]; title: string; sub: string; lang?: boolean }[] = [
  { brand: [{ file: "irctc.svg" }], title: "Tatkal ticket booked", sub: "12621 · 3A · PNR 452 183 9021" },
  { brand: [{ file: "upi.svg" }], title: "Electricity bill paid", sub: "₹1,240 on UPI · next reminder set" },
  { brand: [{ text: "GST", color: "#1B3A8A" }], title: "GSTR-3B filed on time", sub: "Reminded you 3 days before the 20th" },
  { brand: [{ icon: I.siAirindia }, { icon: I.siIndigo }], title: "Web check-in done", sub: "Seat 14A · boarding pass saved" },
  { brand: [{ icon: I.siBookmyshow }], title: "2 tickets, Saturday 7 PM", sub: "Paid on UPI after your OK" },
  { brand: [{ text: "अ", color: K.saffron }], title: "", sub: "", lang: true }
];
const TW = 520, TH = 290;
const tileRect = (k: number): Rect => ({ x: 144 + (k % 3) * (TW + 36), y: 250 + Math.floor(k / 3) * (TH + 36), w: TW, h: TH });

const WALL: { n: string; b: Brand }[] = [
  { n: "IRCTC", b: { file: "irctc.svg" } }, { n: "UPI", b: { file: "upi.svg" } }, { n: "GST", b: { text: "GST", color: "#1B3A8A" } },
  { n: "Air India", b: { icon: I.siAirindia } }, { n: "BookMyShow", b: { icon: I.siBookmyshow } }, { n: "22 languages", b: { text: "अ", color: K.saffron } },
  { n: "DigiLocker", b: { file: "digilocker.svg" } }, { n: "IndiGo", b: { icon: I.siIndigo } }, { n: "Zomato", b: { icon: I.siZomato } },
  { n: "Swiggy", b: { icon: I.siSwiggy } }, { n: "Zerodha", b: { icon: I.siZerodha } }, { n: "Paytm", b: { icon: I.siPaytm } },
  { n: "PhonePe", b: { icon: I.siPhonepe } }, { n: "Google Pay", b: { icon: I.siGooglepay } }, { n: "Flipkart", b: { file: "flipkart.svg" } },
  { n: "Blinkit", b: { file: "blinkit.svg" } }, { n: "MakeMyTrip", b: { file: "makemytrip.svg" } }, { n: "Practo", b: { file: "practo.png" } },
  { n: "Internshala", b: { file: "internshala.png" } }, { n: "Naukri", b: { file: "naukri.png" } }, { n: "Jio", b: { icon: I.siJio } },
  { n: "Airtel", b: { icon: I.siAirtel } }, { n: "Razorpay", b: { icon: I.siRazorpay } }, { n: "WhatsApp", b: { icon: I.siWhatsapp } }
];
const SLOT = [9, 2, 13, 4, 19, 22]; // where the six tiles land in the wall
const SQ = 128;
const wallRect = (slot: number): Rect => ({ x: 343 + (slot % 8) * 158, y: 300 + Math.floor(slot / 8) * 172, w: SQ, h: SQ });
const wallOrder = (() => {
  const free = Array.from({ length: 24 }, (_, i) => i).filter((s) => !SLOT.includes(s));
  return WALL.map((_, i) => (i < 6 ? SLOT[i] : free[i - 6]));
})();
const IMPLODE = { x: 1309 - 20, y: 700 };

/* ------------------------------------------------------------------ film */
export const Film: React.FC<{ withAudio?: boolean }> = ({ withAudio = true }) => (
  <AbsoluteFill>
    <Crt><Scene /></Crt>
    {withAudio ? <Html5Audio src={staticFile("audio/mix.wav")} /> : null}
  </AbsoluteFill>
);

const Scene: React.FC = () => {
  const f = useCurrentFrame();

  // global camera: slow breathing push, small kick on the drop and the end hit
  const kick = (at: number) => (f >= at ? Math.exp(-(f - at) / 6) : 0);
  const cam = 1 + 0.018 * Math.sin(f / 90) + 0.012 * kick(CU.drop) + 0.01 * kick(CU.closeHit);
  const glow = keys(f, [0, 186, 198, 232, 272, 312, 786, 798, 840], [0.12, 0.12, 1, 0.6, 0.45, 0.14, 0.14, 1, 0.7]);

  /* ---- problem: US agent windows */
  const conv = ramp(f, CU.converge, CU.converge + 16, E.in);
  const agents = ["Agent One", "Agent Pro", "Assistant X", "Bot Max"].map((t, i) => {
    const p = spr(f, CU.agents[i], { damping: 18, stiffness: 150 });
    const tag = spr(f, CU.tags[i], { damping: 11 });
    const r0: Rect = { x: 110 + i * 440, y: 270, w: 380, h: 250 };
    const r = lr(conv, r0, { x: 960, y: 420, w: 0, h: 0 });
    return (
      <div key={t} style={{ ...box(r), opacity: p * (1 - conv * 0.4), transform: `scale(${0.88 + 0.12 * p}) rotate(${(i - 1.5) * 1.5}deg)`, borderRadius: 16, background: K.panel, border: `1px solid ${K.line}`, boxShadow: "0 30px 70px rgba(0,0,0,.6)", overflow: "hidden" }}>
        <div style={{ height: 40, display: "flex", alignItems: "center", gap: 12, padding: "0 14px", borderBottom: `1px solid ${K.line}`, color: K.sub, fontSize: 14, fontWeight: 600 }}><Traffic />{t}</div>
        {[0, 1, 2].map((k) => <div key={k} style={{ margin: "18px 20px 0", height: 12, width: `${78 - k * 18}%`, borderRadius: 6, background: "rgba(255,255,255,.08)" }} />)}
        <div style={{ position: "absolute", left: 20, bottom: 20, padding: "8px 16px", borderRadius: 99, background: "rgba(255,69,58,.14)", border: "1px solid rgba(255,69,58,.5)", color: "#FF8A80", fontWeight: 800, fontSize: 19, transform: `scale(${tag})`, transformOrigin: "0 50%" }}>
          {["$200 / month", "$20 / month", "English only", "US waitlist"][i]}
        </div>
      </div>
    );
  });

  /* ---- shared India chips */
  const chips = CHIPS.map((c, i) => {
    const tin = ramp(f, CU.chipsIn + i * 3, CU.chipsIn + i * 3 + 18, E.out);
    const t12 = sm(f, 188 + i * 2, 216 + i * 2);
    const t23 = sm(f, CU.toApp + 2 + i * 2, CU.toApp + 32 + i * 2);
    const r1 = chipRow(i);
    let r = lr(tin, { ...r1, y: 1120 }, r1);
    r = lr(t12, r, orbit(i, f));
    r = lr(t23, r, i === 0 ? BUBBLE : ROW(i - 1));
    const struck = f >= CU.strikes[i] && f < CU.flips[i];
    const ok = f >= CU.flips[i];
    const shake = struck ? Math.sin((f - CU.strikes[i]) * 2.2) * 7 * Math.exp(-(f - CU.strikes[i]) / 6) : 0;
    const badge = ok ? spr(f, CU.flips[i], { damping: 10 }) : struck ? spr(f, CU.strikes[i], { damping: 10 }) : 0;
    const morphed = ramp(t23, 0.45, 1);
    const fadeOut = 1 - ramp(f, CU.appReady - 4, CU.appReady + 2);
    if (f < CU.chipsIn || fadeOut <= 0) return null;
    return (
      <div key={i} style={{ ...box(r), transform: `translateX(${shake}px)`, opacity: fadeOut }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 18, background: K.panel2, border: `1.5px solid ${ok ? "rgba(34,197,94,.7)" : struck ? "rgba(255,69,58,.7)" : K.line}`, display: "flex", alignItems: "center", gap: 14, padding: "0 16px", opacity: 1 - morphed, boxShadow: ok ? "0 0 30px rgba(34,197,94,.18)" : undefined }}>
          <Logo {...c.brand} size={46} flat />
          <span style={{ color: K.text, fontWeight: 700, fontSize: 21 }}>{c.label}</span>
          <div style={{ marginLeft: "auto", width: 30, height: 30, borderRadius: 15, display: "grid", placeItems: "center", background: ok ? K.green : K.red, color: "#fff", fontWeight: 900, fontSize: 17, transform: `scale(${badge})` }}>{ok ? "✓" : "✕"}</div>
        </div>
        <div style={{ position: "absolute", inset: 0, opacity: morphed }}>{i === 0 ? <UserBubble /> : <ConnectedRow i={i - 1} />}</div>
      </div>
    );
  });

  /* ---- Baymax (reveal) -> avatar */
  const rise = spr(f, CU.drop, { damping: 11, stiffness: 105 });
  const toAv = sm(f, CU.toApp, CU.toApp + 34);
  const scale = mix(toAv, 1, 96 / (570 * 0.35));
  const dx = mix(toAv, 0, AV.x - (BX.left + BX.headX));
  const dy = mix(toAv, 0, AV.y - (BX.top + BX.headY));
  const baymaxVisible = f >= CU.drop - 2 && f < CU.appReady;

  /* ---- wordmark "Socius" -> sidebar label */
  const wm = spr(f, TL.vo.meet, { damping: 20, stiffness: 120 });
  const tagT = spr(f, TL.vo.meet + 34, { damping: 20, stiffness: 120 });
  const wmT = sm(f, CU.toApp, CU.toApp + 34);
  const wmScale = mix(wmT, 1, 20 / 170);

  /* ---- app window */
  const reveal = sm(f, CU.toApp + 20, CU.appReady + 4);
  const toTile = sm(f, CU.toTiles, CU.toTiles + 30);
  const winR = lr(toTile, W, tileRect(0));
  const winOn = f >= CU.toApp + 20 && f < CU.toTiles + 32;
  const content = 1 - ramp(f, CU.toTiles, CU.toTiles + 12);

  /* ---- tiles -> wall -> implode */
  const toWall = (k: number) => sm(f, CU.toWall + k * 2, CU.toWall + 30 + k * 2);
  const imp = (k: number) => sm(f, CU.implode + (k % 6) * 1.2, CU.implode + 16 + (k % 6) * 1.2);
  const activeTile = (() => {
    const h = CU.highlights;
    if (f < h[0]) return 0;
    for (let i = h.length - 1; i >= 0; i--) if (f >= h[i]) return i + 1;
    return 0;
  })();

  /* ---- close */
  const riseEnd = spr(f, CU.closeHit - 4, { damping: 11, stiffness: 105 });

  return (
    <AbsoluteFill style={{ background: "#000", fontFamily: K.font, overflow: "hidden" }}>
      {/* stage light */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 55% 60% at 68% 70%, rgba(255,138,31,${0.32 * glow}), transparent 65%), radial-gradient(ellipse 40% 40% at 20% 15%, rgba(255,255,255,${0.04 + 0.03 * glow}), transparent 70%)` }} />
      <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px)", backgroundSize: "34px 34px", opacity: 0.5, maskImage: "radial-gradient(ellipse at center, #000 30%, transparent 75%)" }} />

      <AbsoluteFill style={{ transform: `scale(${cam})` }}>
        {/* problem headlines */}
        {f < CU.drop + 4 ? (
          <div style={{ position: "absolute", left: 0, right: 0, top: 110, display: "grid", placeItems: "center", opacity: 1 - ramp(f, CU.converge, CU.drop) }}>
            <div style={{ position: "absolute" }}><Title t={spr(f, CU.headline1, { damping: 20 }) * (1 - ramp(f, CU.headline2 - 6, CU.headline2 + 2))} size={92}>Today's best AI agents are <span style={{ color: K.red }}>built for America.</span></Title></div>
            <div style={{ position: "absolute" }}><Title t={spr(f, CU.headline2, { damping: 20 })} size={92}>Clueless about <IndiaWord>Indian life.</IndiaWord></Title></div>
          </div>
        ) : null}
        {f < CU.drop + 2 ? agents : null}

        {/* convergence spark -> drop */}
        {f >= CU.converge && f < CU.drop + 14 ? (
          <div style={{ position: "absolute", left: 960 - 6, top: 420 - 6, width: 12, height: 12, borderRadius: 6, background: "#fff", boxShadow: `0 0 ${40 + 200 * ramp(f, CU.converge + 8, CU.drop)}px ${10 + 60 * ramp(f, CU.converge + 8, CU.drop)}px rgba(255,170,90,.9)`, opacity: 1 - ramp(f, CU.drop + 2, CU.drop + 14) }} />
        ) : null}

        {/* app window (grows out of Baymax's avatar), later morphs into tile 1 */}
        {winOn ? (
          <div style={{ ...box(winR), borderRadius: mix(toTile, 18, 26), overflow: "hidden", background: K.panel, border: `1px solid ${K.line}`, boxShadow: "0 50px 120px rgba(0,0,0,.8)", clipPath: reveal < 1 ? `circle(${reveal * 2000}px at ${AV.x - W.x}px ${AV.y - W.y}px)` : undefined }}>
            <div style={{ opacity: content, width: W.w, height: W.h, transform: `scale(${winR.w / W.w}, ${winR.h / W.h})`, transformOrigin: "0 0" }}>
              <AppContent f={f} />
            </div>
          </div>
        ) : null}

        {/* tiles / wall cards */}
        {f >= CU.toTiles + 14 && f < CU.implode + 26
          ? TILES.map((tile, k) => {
              const emerge = k === 0 ? 1 : sm(f, CU.toTiles + 10 + k * 4, CU.toTiles + 34 + k * 4);
              let r = lr(emerge, tileRect(0), tileRect(k));
              const tw = toWall(k);
              r = lr(tw, r, wallRect(SLOT[k]));
              const ip = imp(k);
              r = lr(ip, r, { x: IMPLODE.x, y: IMPLODE.y, w: 0, h: 0 });
              const on = activeTile === k + 0 && f < CU.toWall ? 1 : 0;
              const tileContent = (1 - ramp(tw, 0, 0.4)) * (k === 0 ? 1 : ramp(emerge, 0.65, 1));
              const appear = k === 0 ? ramp(f, CU.toTiles + 14, CU.toTiles + 26) : ramp(emerge, 0, 0.3);
              return (
                <div key={k} style={{ ...box(r), zIndex: 10 - k, opacity: appear * (1 - ip * 0.6), transform: `rotate(${ip * 140}deg)` }}>
                  <div style={{ position: "absolute", inset: 0, borderRadius: mix(tw, 26, SQ * 0.26), background: K.panel2, border: `1.5px solid ${on ? K.saffron : K.line}`, boxShadow: on ? "0 0 0 4px rgba(255,138,31,.18), 0 30px 80px rgba(255,138,31,.18)" : "0 30px 70px rgba(0,0,0,.6)", transform: `scale(${1 + on * 0.025})`, overflow: "hidden" }}>
                    <div style={{ position: "absolute", inset: 0, padding: 30, opacity: tileContent }}>
                      <div style={{ display: "flex", gap: 12 }}>{tile.brand.map((b, j) => <Logo key={j} {...b} size={64} />)}</div>
                      {tile.lang ? <LangSettings /> : (<><div style={{ marginTop: 26, color: K.text, fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em" }}>{tile.title}</div>
                      <div style={{ marginTop: 10, color: K.sub, fontSize: 21, fontWeight: 500 }}>{tile.sub}</div></>)}
                      <div style={{ position: "absolute", right: 26, top: 30, width: 34, height: 34, borderRadius: 17, background: K.green, color: "#fff", display: "grid", placeItems: "center", fontWeight: 900, transform: `scale(${spr(f, k === 0 ? CU.toTiles + 20 : CU.highlights[k - 1] + 6, { damping: 10 })})` }}>✓</div>
                    </div>
                    <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: ramp(tw, 0.25, 0.75) }} />
                    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", opacity: ramp(tw, 0.5, 1) }}><Logo {...tile.brand[0]} size={SQ} flat /></div>
                  </div>
                  <div style={{ position: "absolute", top: r.h + 12, width: r.w, textAlign: "center", color: K.sub, fontSize: 17, fontWeight: 600, opacity: ramp(tw, 0.7, 1) * (1 - ip), whiteSpace: "nowrap" }}>{WALL[k].n}</div>
                </div>
              );
            })
          : null}

        {/* the rest of the marketplace wall */}
        {f >= CU.toWall && f < CU.implode + 26
          ? WALL.slice(6).map((w, j) => {
              const k = j + 6;
              const p = ramp(f, CU.toWall + 8 + j * 1.6, CU.toWall + 34 + j * 1.6, E.out);
              const target = wallRect(wallOrder[k]);
              const ang = (j / 18) * Math.PI * 2;
              const from: Rect = { x: 960 + Math.cos(ang) * 1300, y: 540 + Math.sin(ang) * 900, w: 40, h: 40 };
              let r = lr(p, from, target);
              const ip = imp(k);
              r = lr(ip, r, { x: IMPLODE.x, y: IMPLODE.y, w: 0, h: 0 });
              return (
                <div key={w.n} style={{ ...box(r), opacity: p * (1 - ip * 0.6), transform: `rotate(${(1 - p) * -90 + ip * 140}deg)` }}>
                  <Logo {...w.b} size={r.w} />
                  <div style={{ position: "absolute", top: r.h + 12, width: r.w, textAlign: "center", color: K.sub, fontSize: 17, fontWeight: 600, opacity: ramp(p, 0.7, 1) * (1 - ip), whiteSpace: "nowrap" }}>{w.n}</div>
                </div>
              );
            })
          : null}

        {/* section headlines */}
        {f >= CU.toTiles && f < CU.toWall + 20 ? (
          <div style={{ position: "absolute", left: 144, top: 110, opacity: 1 - ramp(f, CU.toWall, CU.toWall + 14) }}>
            <Title t={spr(f, CU.toTiles + 8, { damping: 20 })} size={80}>Made for how <IndiaWord>India</IndiaWord> works.</Title>
          </div>
        ) : null}
        {f >= CU.toWall && f < CU.implode + 10 ? (
          <div style={{ position: "absolute", left: 343, top: 110, display: "flex", gap: 18, opacity: 1 - ramp(f, CU.implode, CU.implode + 10) }}>
            {[
              <>Runs on your laptop</>,
              <><span>Any model</span>{[{ icon: I.siOllama }, { file: "openai.svg" }, { icon: I.siClaude }].map((b, i) => <Logo key={i} {...b} size={34} flat />)}</>,
              <>Open marketplace</>
            ].map((node, i) => {
              const p = spr(f, CU.badges[i], { damping: 16 });
              return <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 24px", borderRadius: 99, background: i === 2 ? K.saffron : K.panel2, border: `1px solid ${i === 2 ? K.saffron : K.line}`, color: i === 2 ? "#111" : K.text, fontWeight: 800, fontSize: 27, opacity: p, transform: `translateY(${(1 - p) * 20}px) scale(${0.9 + 0.1 * p})` }}>{node}</div>;
            })}
          </div>
        ) : null}
        {f >= CU.badges[2] && f < CU.implode + 10 ? (
          <div style={{ position: "absolute", left: 0, right: 0, top: 880, textAlign: "center", opacity: 1 - ramp(f, CU.implode, CU.implode + 10) }}>
            <Title t={spr(f, CU.badges[2] + 6, { damping: 20 })} size={46} style={{ fontWeight: 700, color: K.sub }}>Built by <IndiaWord>India's</IndiaWord> developers. Teach it anything.</Title>
          </div>
        ) : null}

        {/* reveal wordmark (morphs into the sidebar label) */}
        {f >= TL.vo.meet && f < CU.appReady ? (
          <>
            <div style={{ position: "absolute", left: mix(wmT, 130, 287), top: mix(wmT, 370, 270), transform: `scale(${wmScale})`, transformOrigin: "0 0", opacity: 1 - ramp(f, CU.appReady - 6, CU.appReady) }}>
              <Title t={wm} size={170}>Socius</Title>
            </div>
            <div style={{ position: "absolute", left: 136, top: 580, opacity: 1 - ramp(f, CU.toApp, CU.toApp + 12) }}>
              <Title t={tagT} size={60} style={{ fontWeight: 650, color: "#d4d4d8" }}><IndiaWord>India's</IndiaWord> open AI ally.</Title>
            </div>
          </>
        ) : null}

        {/* Baymax: reveal, then shrinks into the app avatar */}
        {baymaxVisible ? (
          <div style={{ position: "absolute", left: BX.left, top: BX.top, transform: `translate(${dx}px, ${dy + (1 - rise) * 640}px) scale(${scale})`, transformOrigin: `${BX.headX}px ${BX.headY}px` }}>
            <div style={{ transform: `scale(${1 / (1 + Math.sin(rise * Math.PI) * 0.05)}, ${1 + Math.sin(rise * Math.PI) * 0.05})`, transformOrigin: "50% 100%" }}>
              <Baymax width={BX.w} blink={blinkAt(f)} tilt={keys(f, [244, 252, 266], [0, -9, 0])} look={keys(f, [206, 216, 236, 246], [0, -1, -1, 0])} bodyOpacity={1 - ramp(toAv, 0.15, 0.6)} />
            </div>
          </div>
        ) : null}

        {/* shared chips render last so they sit above the window during the hand-off */}
        {chips}

        {/* end card */}
        {f >= CU.implode ? (
          <>
            <div style={{ position: "absolute", left: BX.left, top: BX.top, transform: `translateY(${(1 - riseEnd) * 640}px)` }}>
              <div style={{ transform: `scale(${1 / (1 + Math.sin(riseEnd * Math.PI) * 0.05)}, ${1 + Math.sin(riseEnd * Math.PI) * 0.05})`, transformOrigin: "50% 100%" }}>
                <Baymax width={BX.w} blink={blinkAt(f)} tilt={keys(f, [852, 860, 874], [0, 8, 0])} look={keys(f, [806, 816], [0, -1])} />
              </div>
            </div>
            <div style={{ position: "absolute", left: 130, top: 330 }}>
              <Title t={spr(f, TL.vo.close, { damping: 20 })} size={190}>Socius</Title>
              <Title t={spr(f, CU.tagline, { damping: 20 })} size={84} style={{ marginTop: 22 }}>Built for <IndiaWord>India.</IndiaWord></Title>
              <div style={{ marginTop: 44, color: K.sub, fontSize: 28, fontWeight: 600, opacity: ramp(f, CU.footer, CU.footer + 14) }}>Open source · Runs on your laptop · Any model</div>
              <div style={{ marginTop: 14, color: K.dim, fontSize: 22, fontWeight: 600, opacity: ramp(f, CU.footer + 8, CU.footer + 22) }}>Team California Burrito · CINTEL Ideathon 3.0</div>
            </div>
          </>
        ) : null}
      </AbsoluteFill>

      {/* flashes */}
      <AbsoluteFill style={{ background: "#fff", opacity: 0.3 * kick(CU.drop) * (f >= CU.drop ? 1 : 0) + 0.22 * kick(CU.closeHit) * (f >= CU.closeHit ? 1 : 0) }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.65) 100%)" }} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ app pieces (absolute coords) */
const UserBubble: React.FC = () => (
  <div style={{ position: "absolute", inset: 0, borderRadius: 20, background: "#2A2A31", color: K.text, display: "flex", alignItems: "center", padding: "0 22px", fontSize: 21, fontWeight: 600, whiteSpace: "nowrap" }}>
    Book a Tatkal ticket · Chennai → New Delhi, tomorrow
  </div>
);
const CONNECTED: { b: Brand; n: string }[] = [
  { b: { file: "digilocker.svg" }, n: "DigiLocker" },
  { b: { file: "upi.svg" }, n: "UPI" },
  { b: { text: "GST", color: "#1B3A8A" }, n: "GST" },
  { b: { text: "अ", color: K.saffron }, n: "22 languages" }
];
const ConnectedRow: React.FC<{ i: number }> = ({ i }) => (
  <div style={{ position: "absolute", inset: 0, borderRadius: 12, display: "flex", alignItems: "center", gap: 12, padding: "0 10px", color: K.text, fontSize: 17, fontWeight: 600 }}>
    <Logo {...CONNECTED[i].b} size={30} radius={8} flat />
    {CONNECTED[i].n}
    <div style={{ marginLeft: "auto", width: 8, height: 8, borderRadius: 4, background: K.green }} />
  </div>
);

/** The dark Socius app, drawn in absolute screen coordinates and shifted into the window. */
const AppContent: React.FC<{ f: number }> = ({ f }) => {
  const o = (r: Rect): Rect => ({ ...r, x: r.x - W.x, y: r.y - W.y });
  const s1 = spr(f, CU.step1, { damping: 18 });
  const s2 = spr(f, CU.step2, { damping: 18 });
  const s3 = spr(f, CU.step3, { damping: 18 });
  const booked = f >= CU.booked;
  const press = 1 - Math.min(1, Math.abs(f - CU.click) / 3);
  const cx = keys(f, [CU.cursorIn, CU.click - 4], [1720, 1290]);
  const cy = keys(f, [CU.cursorIn, CU.click - 4], [980, 742]);
  const handoff = ramp(f, CU.appReady - 6, CU.appReady);
  const searching = f < CU.step1Result;
  const note = spr(f, CU.notify, { damping: 18 }) * (1 - ramp(f, CU.toTiles - 8, CU.toTiles));
  const card = (r: Rect): React.CSSProperties => ({ ...box(o(r)), borderRadius: 18, background: K.panel2, border: `1px solid ${K.line}`, padding: 20, overflow: "hidden" });
  return (
    <div style={{ position: "relative", width: W.w, height: W.h, background: K.panel, fontFamily: K.font }}>
      {/* title bar */}
      <div style={{ height: 46, display: "flex", alignItems: "center", padding: "0 18px", borderBottom: `1px solid ${K.line}`, background: "#121216" }}>
        <Traffic />
        <div style={{ flex: 1, textAlign: "center", color: K.sub, fontSize: 15, fontWeight: 600, marginRight: 60 }}>Socius</div>
      </div>
      {/* sidebar */}
      <div style={{ position: "absolute", left: 0, top: 46, bottom: 0, width: 320, background: K.side, borderRight: `1px solid ${K.line}` }} />
      <div style={{ position: "absolute", left: AV.x - W.x - 48, top: AV.y - W.y - 48 }}><BaymaxFace size={96} /></div>
      <div style={{ position: "absolute", left: 0, width: 320, top: 270 - W.y + 4, textAlign: "center", color: K.text, fontWeight: 800, fontSize: 20, opacity: handoff }}>Socius</div>
      <div style={{ position: "absolute", left: 30, top: 380 - W.y, color: K.dim, fontSize: 13, fontWeight: 800, letterSpacing: ".12em" }}>CONNECTED</div>
      {CONNECTED.map((_, i) => <div key={i} style={{ ...box(o(ROW(i))), opacity: handoff }}><ConnectedRow i={i} /></div>)}
      <div style={{ position: "absolute", left: 30, top: 700 - W.y, color: K.dim, fontSize: 13, fontWeight: 800, letterSpacing: ".12em" }}>SPECIALISTS</div>
      {[["Travel agent", "#FF5FA2"], ["Accountant", "#22C55E"], ["College helper", "#0A84FF"]].map(([n, c], i) => (
        <div key={n} style={{ position: "absolute", left: 30, top: 732 - W.y + i * 46, display: "flex", alignItems: "center", gap: 12, color: K.text, fontSize: 17, fontWeight: 600 }}><div style={{ width: 28, height: 28, borderRadius: 9, background: c }} />{n}</div>
      ))}
      {/* chat */}
      <div style={{ ...box(o(BUBBLE)), opacity: handoff }}><UserBubble /></div>
      <div style={{ ...card({ x: 520, y: 250, w: 880, h: 150 }), opacity: s1, transform: `translateY(${(1 - s1) * 30}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Logo file="irctc.svg" size={44} flat />
          <div style={{ color: K.text, fontSize: 20, fontWeight: 700 }}>{searching ? typed("Opening IRCTC · searching Tatkal quota…", f, CU.step1, CU.step1 + 12) : "IRCTC · 1 train with Tatkal seats"}</div>
          <div style={{ marginLeft: "auto", color: searching ? K.sub : K.green, fontWeight: 800 }}>{searching ? "…" : "✓"}</div>
        </div>
        <div style={{ marginTop: 18, padding: "14px 16px", borderRadius: 12, background: "#0F0F13", display: "flex", gap: 26, color: K.sub, fontSize: 17, fontWeight: 600, opacity: ramp(f, CU.step1Result, CU.step1Result + 8) }}>
          <span style={{ color: K.text }}>12621 Tamil Nadu Express</span><span>MAS 22:00 → NDLS 07:05</span><span>3A · Tatkal</span><span style={{ color: K.green }}>AVL 12</span>
        </div>
      </div>
      <div style={{ ...card({ x: 520, y: 420, w: 880, h: 96 }), opacity: s2, transform: `translateY(${(1 - s2) * 30}px)`, display: "flex", alignItems: "center", gap: 14 }}>
        <Logo file="digilocker.svg" size={44} flat />
        <div style={{ color: K.text, fontSize: 20, fontWeight: 700 }}>Passenger ID pulled from DigiLocker</div>
        <div style={{ color: K.sub, fontSize: 17 }}>· Rehaan A. · verified</div>
        <div style={{ marginLeft: "auto", color: K.green, fontWeight: 800 }}>✓</div>
      </div>
      <div style={{ ...card({ x: 520, y: 536, w: 880, h: 250 }), opacity: s3, transform: `translateY(${(1 - s3) * 30}px)`, border: `1.5px solid ${booked ? "rgba(34,197,94,.6)" : "rgba(255,138,31,.6)"}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Logo file="upi.svg" size={44} flat />
          <div style={{ color: booked ? K.green : K.text, fontSize: 22, fontWeight: 800 }}>{booked ? "Ticket booked · PNR 452 183 9021" : "Review payment"}</div>
          <div style={{ marginLeft: "auto", color: booked ? K.green : K.saffron, fontSize: 15, fontWeight: 700 }}>{booked ? "Paid ₹1,845 on UPI" : "Needs your approval"}</div>
        </div>
        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "160px 1fr", rowGap: 10, color: K.sub, fontSize: 18 }}>
          <span>Pay</span><span style={{ color: K.text, fontWeight: 700 }}>₹1,845 to IRCTC via UPI</span>
          <span>Train</span><span style={{ color: K.text }}>12621 · 3A Tatkal · tomorrow 22:00</span>
          <span>Passenger</span><span style={{ color: K.text }}>Rehaan A. (from DigiLocker)</span>
        </div>
        {!booked ? (
          <div style={{ position: "absolute", right: 22, bottom: 20, display: "flex", gap: 12 }}>
            <div style={{ padding: "11px 20px", borderRadius: 11, background: "#25252B", color: K.sub, fontWeight: 700 }}>Decline</div>
            <div style={{ padding: "11px 20px", borderRadius: 11, background: K.saffron, color: "#111", fontWeight: 800, transform: `scale(${1 - press * 0.08})` }}>Approve & pay</div>
          </div>
        ) : null}
      </div>
      {/* composer */}
      <div style={{ ...box(o({ x: 520, y: 900, w: 1200, h: 64 })), borderRadius: 18, border: `1px solid ${K.line}`, background: "#121216", display: "flex", alignItems: "center", padding: "0 20px", color: K.dim, fontSize: 18 }}>
        Message Socius in any Indian language…
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, padding: "7px 14px", borderRadius: 99, background: "#1E1E24", color: K.text, fontSize: 15, fontWeight: 700 }}>
          <Logo icon={I.siOllama} size={24} radius={7} flat /> Ollama · local
        </div>
      </div>
      {/* macOS notification */}
      <div style={{ position: "absolute", left: 1290 - W.x, top: 806 - W.y, width: 430, padding: 16, borderRadius: 20, background: "rgba(40,40,46,.92)", border: `1px solid ${K.line}`, boxShadow: "0 20px 50px rgba(0,0,0,.6)", display: "flex", gap: 14, alignItems: "center", transform: `translateX(${(1 - note) * 520}px)`, opacity: note }}>
        <BaymaxFace size={44} />
        <div><div style={{ color: K.text, fontWeight: 800, fontSize: 16 }}>Socius · now</div><div style={{ color: K.sub, fontSize: 15 }}>Tatkal ticket booked. PNR 452 183 9021</div></div>
      </div>
      {f >= CU.cursorIn ? <Cursor x={cx - W.x} y={cy - W.y} press={press} /> : null}
    </div>
  );
};

/* ------------------------------------------------------------------ language settings (tile 6) */
const LANGS: [string, string][] = [
  ["हिन्दी", "नमस्ते! टिकट बुक हो गया"], ["தமிழ்", "வணக்கம்! டிக்கெட் தயார்"], ["తెలుగు", "నమస్కారం! టికెట్ బుక్ అయింది"],
  ["ಕನ್ನಡ", "ನಮಸ್ಕಾರ! ಟಿಕೆಟ್ ಬುಕ್ ಆಗಿದೆ"], ["മലയാളം", "നമസ്കാരം! ടിക്കറ്റ് ബുക്ക് ചെയ്തു"], ["বাংলা", "নমস্কার! টিকিট বুক হয়েছে"],
  ["मराठी", "नमस्कार! तिकीट बुक झाले"], ["ગુજરાતી", "નમસ્તે! ટિકિટ બુક થઈ ગઈ"], ["ਪੰਜਾਬੀ", "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਟਿਕਟ ਬੁੱਕ ਹੋ ਗਈ"],
  ["ଓଡ଼ିଆ", "ନମସ୍କାର! ଟିକେଟ ବୁକ ହୋଇଗଲା"], ["اردو", "آداب! ٹکٹ بک ہو گیا"], ["অসমীয়া", "নমস্কাৰ! টিকট বুক হ'ল"]
];
const LangSettings: React.FC = () => {
  const f = useCurrentFrame();
  const i = Math.max(0, Math.floor((f - CU.highlights[4]) / 4)) % LANGS.length;
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: K.text, fontSize: 22, fontWeight: 800 }}>
        Language <span style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 99, background: "rgba(255,138,31,.15)", color: K.saffron, fontSize: 15 }}>Auto-detect · 22 Indian languages</span>
      </div>
      <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 7 }}>
        {LANGS.map(([n], k) => (
          <span key={n} style={{ padding: "4px 10px", borderRadius: 8, fontSize: 15, fontWeight: 700, background: k === i ? K.saffron : "#222228", color: k === i ? "#111" : K.sub }}>{n}</span>
        ))}
      </div>
      <div style={{ marginTop: 14, color: K.text, fontSize: 24, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden" }}>{LANGS[i][1]}</div>
    </div>
  );
};
