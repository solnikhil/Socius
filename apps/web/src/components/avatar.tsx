import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Star } from "lucide-react";
import {
  BOT_EYES,
  BOT_SHAPES,
  type BotAppearance,
  type BotEyes,
  type BotShape,
} from "@socius/contracts/appearance";
import { trackAvatar } from "./avatarMotion.js";

const hash = (text: string) => {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};
const colors = [
  "#3b82f6",
  "#a26d3f",
  "#46c36b",
  "#ec4f9c",
  "#2ec4b6",
  "#ef4444",
  "#f2a33a",
  "#8b5cf6",
];
// Each shape is drawn in a 40×40 box; the eyes sit in the upper right.
const shapes: Record<BotShape, ReactNode> = {
  round: <circle cx="20" cy="21" r="17" />,
  squircle: <rect x="3" y="4" width="34" height="34" rx="13" />,
  blob: (
    <path d="M21 3.5c9.4 0 16 7.6 16 17.2 0 9.8-7 16.3-17.2 16.3C9.6 37 3 30.6 3 21.4 3 11.2 11 3.5 21 3.5z" />
  ),
  hex: (
    <path d="M15 4.5h11.5a6 6 0 0 1 5.3 3.2l5 9.6a6 6 0 0 1 0 5.6l-5 9.6a6 6 0 0 1-5.3 3.2H15a6 6 0 0 1-5.3-3.2l-5-9.6a6 6 0 0 1 0-5.6l5-9.6A6 6 0 0 1 15 4.5z" />
  ),
  wide: <ellipse cx="20" cy="22" rx="18" ry="14.5" />,
};
/**
 * Socius's own silhouette: a soft nine-lobed "cookie" no specialist can pick, traced
 * as a smooth closed curve through points on r(θ) = 16.4 + 1.25·cos 9θ.
 */
const sociusPath = (() => {
  const steps = 72;
  const pts = Array.from({ length: steps }, (_, i) => {
    const t = (i / steps) * 2 * Math.PI;
    const r = 16.4 + 1.25 * Math.cos(9 * t);
    return [20 + r * Math.sin(t), 21 - r * Math.cos(t)] as const;
  });
  const at = (i: number) => pts[(i + steps) % steps]!;
  const f = (n: number) => n.toFixed(2);
  let d = `M${f(pts[0]![0])} ${f(pts[0]![1])}`;
  // Catmull-Rom segments as cubic Béziers keep the scallops smooth.
  for (let i = 0; i < steps; i++) {
    const [a, b, c, e] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += `C${f(b[0] + (c[0] - a[0]) / 6)} ${f(b[1] + (c[1] - a[1]) / 6)} ${f(c[0] - (e[0] - b[0]) / 6)} ${f(c[1] - (e[1] - b[1]) / 6)} ${f(c[0])} ${f(c[1])}`;
  }
  return `${d}z`;
})();
export const shapeNames: Record<BotShape, string> = {
  round: "Round",
  squircle: "Soft square",
  blob: "Pebble",
  hex: "Hexagon",
  wide: "Wide",
};
export const eyeNames: Record<BotEyes, string> = {
  slant: "Slanted",
  dots: "Dots",
  pupils: "Curious",
  cyclops: "One eye",
  sleepy: "Sleepy",
};

export function botColor(name: string) {
  return colors[hash(name) % colors.length]!;
}

/** The bot's chosen look, or the one older bots always had, derived from the name. */
export function appearanceOf(
  name: string,
  appearance?: BotAppearance,
): BotAppearance {
  return (
    appearance ?? {
      shape: BOT_SHAPES[(hash(name) >>> 8) % BOT_SHAPES.length]!,
      eyes: "slant",
    }
  );
}

function Eyes({ eyes, main }: { eyes: BotEyes; main: boolean }) {
  const ink = main ? "var(--main-avatar-eyes)" : "rgba(0,0,0,0.82)";
  const white = main ? "var(--main-avatar-eyes)" : "#fff";
  const pupil = main ? "var(--main-avatar)" : "rgba(0,0,0,0.85)";
  switch (eyes) {
    case "dots":
      return (
        <g fill={ink}>
          <circle cx="20" cy="15.5" r="2.6" />
          <circle cx="28.5" cy="16.5" r="2.6" />
        </g>
      );
    case "pupils":
      return (
        <>
          <g fill={white}>
            <ellipse cx="19.2" cy="15.4" rx="4" ry="4.4" />
            <ellipse cx="28.6" cy="16.4" rx="4" ry="4.4" />
          </g>
          <g className="avatar-pupils" fill={pupil}>
            <circle cx="19.6" cy="15.8" r="2" />
            <circle cx="29" cy="16.8" r="2" />
          </g>
        </>
      );
    case "cyclops":
      return (
        <>
          <circle cx="24" cy="16" r="6.4" fill={white} />
          <g className="avatar-pupils" fill={pupil}>
            <circle cx="24.4" cy="16.4" r="3" />
          </g>
        </>
      );
    case "sleepy":
      return (
        <g
          fill="none"
          stroke={ink}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M16.6 15.2q3 2.8 6 0" />
          <path d="M25.4 16.2q3 2.8 6 0" />
        </g>
      );
    default:
      return (
        <g fill={ink}>
          <rect
            x="18.5"
            y="11"
            width="3.6"
            height="7.6"
            rx="1.8"
            transform="rotate(-14 20 15)"
          />
          <rect
            x="26.5"
            y="12.4"
            width="3.6"
            height="7.6"
            rx="1.8"
            transform="rotate(-14 28 16)"
          />
        </g>
      );
  }
}

/**
 * A bot's face. It breathes, blinks, glances or circles its eyes when idle, follows
 * the pointer like a magnet and, while `busy`, bobs and revolves its eyes in a smooth circle. Reduced motion keeps it still.
 */
export function Avatar({
  name,
  main = false,
  size = 36,
  badge = false,
  appearance,
  busy = false,
}: {
  name: string;
  main?: boolean;
  size?: number;
  badge?: boolean;
  appearance?: BotAppearance | undefined;
  /** The bot is working on a reply. */
  busy?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => trackAvatar(ref.current!), []);
  const h = hash(name);
  // Socius keeps its monochrome cookie face; specialists wear their chosen look.
  const look = main
    ? { shape: "round" as const, eyes: appearance?.eyes ?? "slant" }
    : appearanceOf(name, appearance);
  // Staggered timings so a sidebar full of bots never blinks in unison.
  const style = {
    width: size,
    height: size,
    "--blink-delay": `${-(h % 5000) / 1000}s`,
    "--blink-time": `${4.2 + ((h >>> 4) % 30) / 10}s`,
    "--idle-delay": `${-((h >>> 9) % 9000) / 1000}s`,
    "--breathe-delay": `${-((h >>> 13) % 4000) / 1000}s`,
  } as CSSProperties;
  return (
    <span
      ref={ref}
      className={`avatar ${main ? "main" : ""} ${busy ? "busy" : ""}`}
      data-idle={["orbit", "glance", "orbit", "wander"][(h >>> 3) % 4]}
      data-eyes={look.eyes}
      style={style}
      aria-hidden="true"
    >
      <span className="avatar-lean">
        <span className="avatar-breathe">
          <svg viewBox="0 0 40 40" width={size} height={size}>
            <g fill={main ? "var(--main-avatar)" : botColor(name)}>
              {main ? <path d={sociusPath} /> : shapes[look.shape]}
            </g>
            <g className="avatar-eyes">
              <g className="avatar-idle">
                <g className="avatar-blink">
                  <Eyes eyes={look.eyes} main={main} />
                </g>
              </g>
            </g>
          </svg>
        </span>
      </span>
      {badge && (
        <span className="avatar-badge">
          <Star size={size * 0.13} fill="currentColor" strokeWidth={0} />
        </span>
      )}
    </span>
  );
}

type Face = { name: string; main?: boolean; appearance?: BotAppearance };

/** Up to three member avatars tucked into one tile; the coordinator comes first. */
export function GroupAvatar({
  names,
  size = 36,
  busy = false,
}: {
  names: Face[];
  size?: number;
  busy?: boolean;
}) {
  const shown = names.slice(0, 3);
  const inner = Math.round(size * (shown.length > 2 ? 0.54 : 0.62));
  const spots =
    shown.length > 2
      ? [
          [0, 0],
          [size - inner, 0],
          [(size - inner) / 2, size - inner],
        ]
      : [
          [0, 0],
          [size - inner, size - inner],
        ];
  return (
    <span
      className="avatar group-avatar"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {shown.map((n, i) => (
        <span
          key={`${n.name}-${i}`}
          style={{ left: spots[i]![0], top: spots[i]![1] }}
        >
          <Avatar
            name={n.name}
            main={!!n.main}
            size={inner}
            appearance={n.appearance}
            busy={busy}
          />
        </span>
      ))}
    </span>
  );
}

/** Shape and eye choices with a live preview, for creating or restyling a bot. */
export function AvatarPicker({
  name,
  value,
  onChange,
  compact = false,
}: {
  name: string;
  value: BotAppearance;
  onChange: (next: BotAppearance) => void;
  compact?: boolean;
}) {
  const option = (
    kind: "shape" | "eyes",
    key: string,
    label: string,
    face: BotAppearance,
  ) => {
    const selected = value[kind] === key;
    return (
      <button
        key={key}
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={label}
        title={label}
        className={`look-option ${selected ? "selected" : ""}`}
        onClick={() => onChange(face)}
      >
        <Avatar name={name} size={compact ? 22 : 26} appearance={face} />
      </button>
    );
  };
  return (
    <div className={`avatar-picker ${compact ? "compact" : ""}`}>
      <div className="look-preview">
        <Avatar name={name} size={compact ? 44 : 64} appearance={value} />
      </div>
      <div className="look-rows">
        <div className="look-row" role="radiogroup" aria-label="Shape">
          <span>Shape</span>
          {BOT_SHAPES.map((shape) =>
            option("shape", shape, shapeNames[shape], { ...value, shape }),
          )}
        </div>
        <div className="look-row" role="radiogroup" aria-label="Eyes">
          <span>Eyes</span>
          {BOT_EYES.map((eyes) =>
            option("eyes", eyes, `${eyeNames[eyes]} eyes`, { ...value, eyes }),
          )}
        </div>
      </div>
    </div>
  );
}
