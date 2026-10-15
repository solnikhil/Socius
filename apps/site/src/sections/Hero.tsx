import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { ArrowRight, ChevronDown } from "lucide-react";
import type { BotAppearance } from "@socius/contracts/appearance";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Magnetic, Scribble, Words, ease } from "../components/motion.js";

type Sticker = {
  name: string;
  role: string;
  look: BotAppearance;
  tone: string;
  /** Position around the mascot, in percent of the stage. */
  at: [number, number];
  depth: number;
};

const stickers: Sticker[] = [
  {
    name: "Researcher",
    role: "Finds sources",
    look: { shape: "blob", eyes: "pupils" },
    tone: "bg-n-blue-bg",
    at: [4, 18],
    depth: 1.4,
  },
  {
    name: "Writer",
    role: "Drafts in your voice",
    look: { shape: "squircle", eyes: "slant" },
    tone: "bg-n-pink-bg",
    at: [74, 8],
    depth: 0.9,
  },
  {
    name: "Analyst",
    role: "Checks the numbers",
    look: { shape: "hex", eyes: "dots" },
    tone: "bg-n-green-bg",
    at: [80, 62],
    depth: 1.6,
  },
  {
    name: "Planner",
    role: "Keeps the week sane",
    look: { shape: "wide", eyes: "cyclops" },
    tone: "bg-n-yellow-bg",
    at: [0, 66],
    depth: 1.1,
  },
];

function FloatingSticker({
  s,
  i,
  scroll,
}: {
  s: Sticker;
  i: number;
  scroll: MotionValue<number>;
}) {
  // Each sticker drifts up at its own depth as the page scrolls.
  const y = useTransform(scroll, [0, 1], [0, -160 * s.depth]);
  return (
    <motion.div
      className="absolute hidden sm:block"
      style={{ left: `${s.at[0]}%`, top: `${s.at[1]}%`, y }}
      initial={{ opacity: 0, scale: 0.6, rotate: i % 2 ? 8 : -8 }}
      animate={{ opacity: 1, scale: 1, rotate: i % 2 ? 3 : -3 }}
      transition={{ duration: 1, ease, delay: 0.7 + i * 0.12 }}
    >
      <div
        className="animate-float"
        style={{
          animationDelay: `${-i * 1.4}s`,
          animationDuration: `${5 + i}s`,
        }}
      >
        <motion.div
          whileHover={{ scale: 1.08, rotate: 0 }}
          className={cn(
            "flex items-center gap-2.5 rounded-2xl border border-line py-2 pl-2 pr-4 shadow-card",
            s.tone,
          )}
        >
          <Avatar name={s.name} size={34} appearance={s.look} />
          <div className="leading-tight">
            <div className="text-[14px] font-semibold text-ink">{s.name}</div>
            <div className="text-[12px] text-ink-3">{s.role}</div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const mascotY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const mascotScale = useTransform(scrollYProgress, [0, 1], [1, 0.85]);
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <section
      id="top"
      ref={ref}
      className="relative overflow-hidden px-4 pb-10 pt-28 sm:px-6 sm:pt-32"
    >
      <div className="dot-grid pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,#000_20%,transparent_70%)]" />
      <div className="mx-auto max-w-6xl text-center">
        {/* Stage: the mascot with its team floating around it. */}
        <div className="relative mx-auto h-[200px] max-w-3xl sm:h-[260px]">
          {stickers.map((s, i) => (
            <FloatingSticker
              key={s.name}
              s={s}
              i={i}
              scroll={scrollYProgress}
            />
          ))}
          <motion.div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ y: mascotY, scale: mascotScale }}
          >
            <motion.div
              initial={{ scale: 0.3, opacity: 0, rotate: -30 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{
                type: "spring",
                stiffness: 160,
                damping: 14,
                delay: 0.15,
              }}
            >
              <div className="relative">
                <motion.div
                  className="absolute inset-[-30%] -z-10 rounded-full bg-[radial-gradient(circle,var(--c-blue-bg),transparent_65%)]"
                  animate={{ scale: [1, 1.12, 1] }}
                  transition={{
                    duration: 5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
                <Avatar name="Socius" main size={150} />
              </div>
            </motion.div>
          </motion.div>
        </div>

        <motion.div style={{ opacity: fade }}>
          <motion.a
            href="#get"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease, delay: 0.3 }}
            className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full border border-line bg-paper py-1 pl-1 pr-3 text-[13px] text-ink-2 shadow-card transition-colors hover:bg-paper-2"
          >
            <span className="rounded-full bg-n-green-bg px-2 py-0.5 font-medium text-n-green">
              Early preview
            </span>
            Free · bring your own model
            <ArrowRight className="size-3.5" />
          </motion.a>

          <h1 className="mx-auto mt-6 max-w-4xl text-[44px] font-bold leading-[1.02] tracking-[-0.035em] text-ink sm:text-[68px] lg:text-[82px]">
            <Words text="Your AI ally," delay={0.35} />
            <br />
            <span className="relative inline-block">
              <Words text="on *your* computer." delay={0.55} />
              <Scribble
                className="-bottom-2 left-[6%] h-4 w-[88%] text-n-yellow sm:-bottom-3 sm:h-5"
                delay={1.2}
              />
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.9, ease, delay: 0.9 }}
            className="mx-auto mt-7 max-w-2xl text-[18px] leading-relaxed text-ink-3 sm:text-[20px]"
          >
            Socius is a desktop companion with a team of private specialist
            bots, memory you can open and edit, and your approval on every
            action that matters. Use any of 29 model providers, local or cloud.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease, delay: 1.05 }}
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Magnetic>
              <Button
                asChild
                className="group h-12 rounded-xl bg-brand px-6 text-[16px] font-semibold text-white shadow-[0_8px_24px_-8px_var(--blue)] hover:bg-brand-hover"
              >
                <a href="#get">
                  Get Socius
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </a>
              </Button>
            </Magnetic>
            <Button
              asChild
              variant="ghost"
              className="h-12 rounded-xl px-5 text-[16px] font-medium text-ink hover:bg-paper-3"
            >
              <a href="#demo">
                Watch it work
                <ChevronDown className="size-4" />
              </a>
            </Button>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4, duration: 1 }}
            className="mt-5 text-[13px] text-ink-3"
          >
            macOS · Windows · Linux &nbsp;·&nbsp; no account, no analytics
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}
