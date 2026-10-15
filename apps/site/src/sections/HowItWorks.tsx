import { useRef, useState, type ReactNode } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
} from "motion/react";
import { Activity, KeyRound, Sparkles } from "lucide-react";
import { ProviderMark } from "@/components/ProviderMark";
import { Avatar } from "@/components/avatar";
import { cn } from "@/lib/utils";
import { Eyebrow, Reveal, Words, ease } from "../components/motion.js";

function ModelVisual() {
  const rows = [
    {
      id: "ollama" as const,
      name: "Ollama",
      note: "Local · llama3.3",
      on: true,
    },
    {
      id: "anthropic" as const,
      name: "Anthropic",
      note: "Key encrypted by your OS",
      on: true,
    },
    {
      id: "openrouter" as const,
      name: "OpenRouter",
      note: "Not connected",
      on: false,
    },
  ];
  return (
    <div className="w-full max-w-sm space-y-2.5">
      {rows.map((r, i) => (
        <motion.div
          key={r.id}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.1, ease, duration: 0.6 }}
          className="flex items-center gap-3 rounded-xl border border-line bg-paper p-3 shadow-card"
        >
          <ProviderMark id={r.id} size={34} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[14px] font-semibold text-ink">{r.name}</div>
            <div className="text-[12px] text-ink-3">{r.note}</div>
          </div>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              r.on ? "bg-n-green-bg text-n-green" : "bg-paper-3 text-ink-3",
            )}
          >
            {r.on ? "Ready" : "Add"}
          </span>
        </motion.div>
      ))}
      <div className="flex items-center gap-2 px-1 pt-1 text-[12px] text-ink-3">
        <KeyRound className="size-3.5" /> The interface never receives a stored
        key.
      </div>
    </div>
  );
}

function MeetVisual() {
  return (
    <div className="flex flex-col items-center gap-5">
      <Avatar name="Socius" main size={110} />
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.3, ease, duration: 0.6 }}
        className="max-w-xs rounded-2xl rounded-tl-md border border-line bg-paper px-4 py-3 text-[14px] text-ink-2 shadow-card"
      >
        Hi! I'm Socius. Tell me what you're working on — I'll remember only what
        you let me.
      </motion.div>
    </div>
  );
}

function ProposeVisual() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ease, duration: 0.6 }}
      className="w-full max-w-sm overflow-hidden rounded-2xl border border-line-strong bg-paper shadow-window"
    >
      <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-[13px] font-medium text-ink">
        <Sparkles className="size-4 text-n-purple" /> Socius proposes a
        specialist
      </div>
      <div className="flex items-center gap-3 px-4 pt-4">
        <Avatar
          name="Researcher"
          size={44}
          appearance={{ shape: "blob", eyes: "pupils" }}
        />
        <div className="leading-tight">
          <div className="font-semibold text-ink">Researcher</div>
          <div className="text-[13px] text-ink-3">
            Finds and summarizes sources
          </div>
        </div>
      </div>
      <div className="m-4 rounded-lg bg-paper-2 p-3 font-mono text-[11px] leading-relaxed text-ink-2">
        Cite every claim. Prefer primary sources. Ask before reading anything
        behind a login.
      </div>
      <div className="flex gap-2 px-4 pb-4">
        <span className="rounded-lg bg-ink px-3 py-1.5 text-[13px] font-medium text-paper">
          Create bot
        </span>
        <span className="rounded-lg px-3 py-1.5 text-[13px] text-ink-2">
          Edit first
        </span>
      </div>
    </motion.div>
  );
}

function ActivityVisual() {
  const log = [
    ["Approved", "Create page in Notion", "2m"],
    ["Memory", "Writer saved 1 note", "14m"],
    ["Installed", "Weekly review skill", "1h"],
    ["Declined", "Click “Buy now”", "3h"],
  ];
  return (
    <div className="w-full max-w-sm rounded-2xl border border-line bg-paper p-2 shadow-card">
      <div className="flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-ink">
        <Activity className="size-4" /> Activity
      </div>
      {log.map(([kind, what, when], i) => (
        <motion.div
          key={what}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08, ease, duration: 0.5 }}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] hover:bg-paper-2"
        >
          <span
            className={cn(
              "w-[72px] shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] font-medium",
              kind === "Declined"
                ? "bg-n-red-bg text-n-red"
                : "bg-paper-3 text-ink-3",
            )}
          >
            {kind}
          </span>
          <span className="flex-1 truncate text-ink-2">{what}</span>
          <span className="text-ink-3">{when}</span>
        </motion.div>
      ))}
    </div>
  );
}

const steps: {
  title: string;
  body: string;
  tone: string;
  visual: ReactNode;
}[] = [
  {
    title: "Bring a model",
    body: "Connect a local model through Ollama, LM Studio or llama.cpp, or sign in to any of the cloud providers. Keys are encrypted by your operating system, and you choose a default per bot.",
    tone: "bg-n-blue-bg",
    visual: <ModelVisual />,
  },
  {
    title: "Meet Socius",
    body: "Your main ally is ready on first launch. Chat, attach notes, and turn on memory only when you want it to remember.",
    tone: "bg-n-yellow-bg",
    visual: <MeetVisual />,
  },
  {
    title: "Grow your team",
    body: "When a job keeps coming up, Socius can propose a specialist. You read its exact role and instructions before it exists.",
    tone: "bg-n-purple-bg",
    visual: <ProposeVisual />,
  },
  {
    title: "Stay in charge",
    body: "Anything that changes the outside world waits for you. Every chat, approval, memory change and install lands in a local Activity record.",
    tone: "bg-n-green-bg",
    visual: <ActivityVisual />,
  },
];

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 40%", "end 60%"],
  });
  const bar = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  useMotionValueEvent(scrollYProgress, "change", (v) =>
    setActive(
      Math.min(steps.length - 1, Math.max(0, Math.floor(v * steps.length))),
    ),
  );
  const step = steps[active]!;

  return (
    <section id="how" className="scroll-mt-20 bg-paper-2 px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <Reveal>
            <Eyebrow tone="purple">How it works</Eyebrow>
          </Reveal>
          <h2 className="mt-4 text-[38px] font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[56px]">
            <Words text="Set up in minutes. *Yours* for good." />
          </h2>
        </div>

        <div ref={ref} className="mt-14 grid gap-10 lg:grid-cols-2 lg:gap-16">
          {/* Sticky visual (large screens) */}
          <div className="hidden lg:block">
            <div className="sticky top-28">
              <div
                className={cn(
                  "relative grid aspect-[5/4] place-items-center overflow-hidden rounded-3xl border border-line p-10 transition-colors duration-700",
                  step.tone,
                )}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={active}
                    className="grid w-full place-items-center"
                    initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -30, filter: "blur(10px)" }}
                    transition={{ duration: 0.5, ease }}
                  >
                    {step.visual}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute bottom-0 left-[15px] top-0 hidden w-[2px] rounded bg-line lg:block">
              <motion.div
                className="w-full origin-top rounded bg-brand"
                style={{ scaleY: bar, height: "100%" }}
              />
            </div>
            {steps.map((s, i) => (
              <div
                key={s.title}
                className="flex min-h-[auto] flex-col justify-center lg:min-h-[62vh] lg:pl-14"
              >
                <motion.div
                  animate={{ opacity: active === i ? 1 : 0.35 }}
                  transition={{ duration: 0.4 }}
                  className="max-lg:!opacity-100"
                >
                  <div className="relative">
                    <span
                      className={cn(
                        "absolute -left-14 top-0 hidden size-8 place-items-center rounded-full border-2 text-[13px] font-semibold transition-colors duration-500 lg:grid",
                        active >= i
                          ? "border-brand bg-brand text-white"
                          : "border-line-strong bg-paper-2 text-ink-3",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="text-[13px] font-medium text-ink-3 lg:hidden">
                      Step {i + 1}
                    </span>
                    <h3 className="text-[28px] font-bold tracking-tight text-ink sm:text-[34px]">
                      {s.title}
                    </h3>
                    <p className="mt-3 max-w-md text-[17px] leading-relaxed text-ink-3">
                      {s.body}
                    </p>
                  </div>
                </motion.div>
                <div
                  className={cn(
                    "mb-14 mt-6 grid place-items-center rounded-3xl border border-line p-6 lg:hidden",
                    s.tone,
                  )}
                >
                  {s.visual}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
