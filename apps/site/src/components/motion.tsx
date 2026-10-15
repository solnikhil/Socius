import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { cn } from "@/lib/utils";

/** The site's one easing curve: quick out, long settle. */
export const ease = [0.22, 1, 0.36, 1] as const;

/** Fades, lifts and unblurs its children the first time they scroll into view. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 28,
}: {
  children: ReactNode;
  className?: string | undefined;
  delay?: number;
  y?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.9, ease, delay }}
    >
      {children}
    </motion.div>
  );
}

/** A heading whose words rise in one after another. `*word*` renders in the serif italic. */
export function Words({
  text,
  className,
  delay = 0,
  stagger = 0.06,
}: {
  text: string;
  className?: string | undefined;
  delay?: number;
  stagger?: number;
}) {
  const words = text.split(" ");
  return (
    <span className={className}>
      {words.map((word, i) => {
        const serif = word.startsWith("*");
        const clean = word.replaceAll("*", "");
        return (
          <span
            key={i}
            className="inline-block overflow-hidden pb-[0.12em] align-bottom"
          >
            <motion.span
              className={cn(
                "inline-block",
                serif && "font-serif font-normal italic tracking-normal",
              )}
              initial={{ y: "105%", opacity: 0, rotate: 4 }}
              whileInView={{ y: 0, opacity: 1, rotate: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.9, ease, delay: delay + i * stagger }}
            >
              {clean}
            </motion.span>
            {i < words.length - 1 && " "}
          </span>
        );
      })}
    </span>
  );
}

/** Counts up to `to` once visible. */
export function CountUp({
  to,
  suffix = "",
  duration = 1.6,
}: {
  to: number;
  suffix?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true });
  const still = useReducedMotion();
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (still) return setValue(to);
    const run = animate(0, to, {
      duration,
      ease,
      onUpdate: (v) => setValue(Math.round(v)),
    });
    return () => run.stop();
  }, [seen, still, to, duration]);
  return (
    <span ref={ref}>
      <span className="tabular-nums">{value}</span>
      {suffix}
    </span>
  );
}

/** Drifts its child toward the pointer while hovered. */
export function Magnetic({
  children,
  strength = 0.3,
  className,
}: {
  children: ReactNode;
  strength?: number;
  className?: string | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(useMotionValue(0), { stiffness: 220, damping: 16 });
  const y = useSpring(useMotionValue(0), { stiffness: 220, damping: 16 });
  const move = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    x.set((e.clientX - r.left - r.width / 2) * strength);
    y.set((e.clientY - r.top - r.height / 2) * strength);
  };
  const leave = () => {
    x.set(0);
    y.set(0);
  };
  return (
    <motion.div
      ref={ref}
      className={cn("inline-block", className)}
      style={{ x, y }}
      onPointerMove={move}
      onPointerLeave={leave}
    >
      {children}
    </motion.div>
  );
}

/** A card with a soft light that follows the pointer. */
export function Spotlight({
  children,
  className,
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: PointerEvent) => {
    const el = ref.current!;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--x", `${e.clientX - r.left}px`);
    el.style.setProperty("--y", `${e.clientY - r.top}px`);
  };
  return (
    <div
      ref={ref}
      onPointerMove={move}
      className={cn("spotlight relative isolate", className)}
    >
      {children}
    </div>
  );
}

/** A hand-drawn underline that draws itself in. */
export function Scribble({
  className,
  delay = 0.6,
}: {
  className?: string | undefined;
  delay?: number;
}) {
  return (
    <svg
      viewBox="0 0 300 24"
      fill="none"
      preserveAspectRatio="none"
      className={cn("pointer-events-none absolute", className)}
      aria-hidden="true"
    >
      <motion.path
        d="M4 16C58 7 132 4 200 8c34 2 64 5 94 11M40 20c52-5 120-7 196-3"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        whileInView={{ pathLength: 1, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.1, ease: "easeInOut", delay }}
      />
    </svg>
  );
}

/** A section's small label, eyebrow-style. */
export function Eyebrow({
  children,
  tone = "blue",
}: {
  children: ReactNode;
  tone?: "blue" | "orange" | "green" | "purple" | "pink" | "yellow" | "red";
}) {
  const tones = {
    blue: "bg-n-blue-bg text-n-blue",
    orange: "bg-n-orange-bg text-n-orange",
    green: "bg-n-green-bg text-n-green",
    purple: "bg-n-purple-bg text-n-purple",
    pink: "bg-n-pink-bg text-n-pink",
    yellow: "bg-n-yellow-bg text-n-yellow",
    red: "bg-n-red-bg text-n-red",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
