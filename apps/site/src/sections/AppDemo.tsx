import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useInView,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  FileText,
  Paperclip,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { BotAppearance } from "@socius/contracts/appearance";
import { Avatar, GroupAvatar } from "@/components/avatar";
import { cn } from "@/lib/utils";
import { ease } from "../components/motion.js";

const ask = "Plan my launch week and put the announcement draft in Notion.";
const reply =
  "Here's your week: research on Monday, the draft Tuesday, review Wednesday, ship Thursday. Writer drafted the announcement in your voice — check the exact page below before anything is written to Notion.";

const bots: { name: string; look: BotAppearance; note?: string }[] = [
  { name: "Researcher", look: { shape: "blob", eyes: "pupils" } },
  { name: "Writer", look: { shape: "squircle", eyes: "slant" }, note: "dot" },
  { name: "Analyst", look: { shape: "hex", eyes: "dots" } },
  { name: "Planner", look: { shape: "wide", eyes: "cyclops" } },
];

/** Stages of the scripted conversation, in order. */
type Stage =
  | "typing"
  | "sent"
  | "thinking"
  | "asking"
  | "streaming"
  | "approval"
  | "approved";
const timings: [Stage, number][] = [
  ["typing", 2600],
  ["sent", 700],
  ["thinking", 1500],
  ["asking", 1900],
  ["streaming", 3600],
  ["approval", 2200],
  ["approved", 3200],
];
const order = timings.map(([s]) => s);
const reached = (now: Stage, s: Stage) =>
  order.indexOf(now) >= order.indexOf(s);

function useScript(active: boolean) {
  const [stage, setStage] = useState<Stage>("typing");
  const [typed, setTyped] = useState(0);
  const [streamed, setStreamed] = useState(0);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timers: number[] = [];
    const wait = (ms: number) =>
      new Promise<void>((r) => timers.push(window.setTimeout(r, ms)));
    const run = async () => {
      while (!cancelled) {
        setTyped(0);
        setStreamed(0);
        for (const [s, ms] of timings) {
          if (cancelled) return;
          setStage(s);
          if (s === "typing") {
            for (let i = 1; i <= ask.length && !cancelled; i++) {
              setTyped(i);
              await wait(ms / ask.length);
            }
          } else if (s === "streaming") {
            const words = reply.split(" ");
            for (let i = 1; i <= words.length && !cancelled; i++) {
              setStreamed(words.slice(0, i).join(" ").length);
              await wait(ms / words.length);
            }
          } else await wait(ms);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [active]);
  return { stage, typed, streamed };
}

function Sidebar({ busy }: { busy: boolean }) {
  return (
    <aside className="hidden w-[232px] shrink-0 flex-col border-r border-line bg-paper-2 p-3 md:flex">
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[13px] text-ink-3">
        <Search className="size-3.5" /> Search
        <span className="ml-auto font-mono text-[11px]">⌘K</span>
      </div>
      <div className="flex items-center gap-3 rounded-xl bg-paper-3 p-2.5">
        <Avatar name="Socius" main size={36} busy={busy} />
        <div className="min-w-0 leading-tight">
          <div className="text-[14px] font-semibold text-ink">Socius</div>
          <div className="truncate text-[12px] text-ink-3">
            {busy ? "working…" : "Your ally"}
          </div>
        </div>
      </div>
      <div className="mb-1 mt-4 px-2 text-[11px] font-medium uppercase tracking-wider text-ink-3">
        Specialists
      </div>
      {bots.map((b) => (
        <div
          key={b.name}
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[14px] text-ink-2"
        >
          <Avatar
            name={b.name}
            size={26}
            appearance={b.look}
            busy={busy && b.name === "Writer"}
          />
          {b.name}
          {b.note && <span className="ml-auto size-2 rounded-full bg-brand" />}
        </div>
      ))}
      <div className="mb-1 mt-4 px-2 text-[11px] font-medium uppercase tracking-wider text-ink-3">
        Groups
      </div>
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[14px] text-ink-2">
        <GroupAvatar
          size={26}
          names={[
            { name: "Socius", main: true },
            {
              name: "Writer",
              appearance: { shape: "squircle", eyes: "slant" },
            },
            { name: "Analyst", appearance: { shape: "hex", eyes: "dots" } },
          ]}
        />
        Launch team
      </div>
      <div className="mt-auto flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-ink-3">
        <Plus className="size-4" /> New bot
      </div>
    </aside>
  );
}

function Approval({ approved }: { approved: boolean }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease }}
      className="relative mt-3 max-w-md overflow-hidden rounded-xl border border-line-strong bg-paper shadow-card"
    >
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-[13px] font-medium text-ink">
        <ShieldCheck className="size-4 text-n-blue" />
        Create a page in Notion
        <span className="ml-auto rounded bg-n-gray-bg px-1.5 py-0.5 font-mono text-[10px] text-ink-3">
          sha256 7f3a…c91e
        </span>
      </div>
      <div className="space-y-2 px-4 py-3 text-[13px]">
        <div className="flex gap-3">
          <span className="w-14 shrink-0 text-ink-3">Title</span>
          <span className="font-medium text-ink">Launch announcement</span>
        </div>
        <div className="flex gap-3">
          <span className="w-14 shrink-0 text-ink-3">Content</span>
          <span className="flex items-start gap-1.5 text-ink-2">
            <FileText className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
            “Today we're launching…” · 412 words
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
        <AnimatePresence mode="wait" initial={false}>
          {approved ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 text-[13px] font-medium text-n-green"
            >
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 14 }}
                className="grid size-5 place-items-center rounded-full bg-n-green text-white"
              >
                <Check className="size-3" strokeWidth={3} />
              </motion.span>
              Approved · ran once
            </motion.div>
          ) : (
            <motion.div key="ask" exit={{ opacity: 0 }} className="flex gap-2">
              <span className="rounded-lg bg-ink px-3 py-1.5 text-[13px] font-medium text-paper">
                Approve
              </span>
              <span className="rounded-lg px-3 py-1.5 text-[13px] text-ink-2">
                Decline
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* A cursor glides to Approve and clicks. */}
      {!approved && (
        <motion.svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute size-6 drop-shadow-md"
          initial={{ left: "88%", top: "110%", opacity: 0 }}
          animate={{ left: "13%", top: "82%", opacity: 1 }}
          transition={{ duration: 1.2, ease, delay: 0.7 }}
        >
          <motion.path
            d="M4 2l15 9-6.5 1.5L9.5 19z"
            fill="var(--ink)"
            stroke="var(--paper)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            animate={{ scale: [1, 1, 0.8, 1] }}
            transition={{ duration: 0.4, delay: 1.9, times: [0, 0.3, 0.6, 1] }}
          />
        </motion.svg>
      )}
    </motion.div>
  );
}

export function AppDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20%" });
  const { stage, typed, streamed } = useScript(inView);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "start 30%"],
  });
  const p = useSpring(scrollYProgress, { stiffness: 90, damping: 24 });
  const rotateX = useTransform(p, [0, 1], [24, 0]);
  const scale = useTransform(p, [0, 1], [0.9, 1]);
  const y = useTransform(p, [0, 1], [60, 0]);

  const busy = reached(stage, "thinking") && !reached(stage, "approval");

  return (
    <section id="demo" className="px-4 pb-24 sm:px-6">
      <div className="mx-auto max-w-6xl [perspective:1800px]">
        <motion.div
          ref={ref}
          style={{ rotateX, scale, y, transformOrigin: "50% 0%" }}
          className="overflow-hidden rounded-2xl border border-line-strong bg-paper shadow-window"
        >
          {/* Window chrome */}
          <div className="flex h-10 items-center gap-2 border-b border-line bg-paper-2 px-4">
            <span className="size-3 rounded-full bg-[#ff5f57]" />
            <span className="size-3 rounded-full bg-[#febc2e]" />
            <span className="size-3 rounded-full bg-[#28c840]" />
            <span className="mx-auto text-[12px] font-medium text-ink-3">
              Socius
            </span>
            <span className="w-12" />
          </div>
          <div className="flex h-[540px] sm:h-[580px]">
            <Sidebar busy={busy} />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-3 border-b border-line px-5 py-3">
                <Avatar name="Socius" main size={28} busy={busy} />
                <span className="font-semibold text-ink">Socius</span>
                <span className="ml-auto flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[12px] text-ink-3">
                  Default model <ChevronDown className="size-3" />
                </span>
              </div>
              <div className="flex-1 space-y-4 overflow-hidden px-5 py-6 text-[15px] sm:px-8">
                <AnimatePresence>
                  {reached(stage, "sent") && (
                    <motion.div
                      key="user"
                      initial={{ opacity: 0, y: 14, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.5, ease }}
                      className="ml-auto w-fit max-w-[80%] origin-bottom-right rounded-2xl rounded-br-md bg-paper-3 px-4 py-2.5 text-ink"
                    >
                      {ask}
                    </motion.div>
                  )}
                  {reached(stage, "thinking") && (
                    <motion.div
                      key="bot"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, ease }}
                      className="flex gap-3"
                    >
                      <Avatar name="Socius" main size={30} busy={busy} />
                      <div className="min-w-0 flex-1 pt-1">
                        {reached(stage, "asking") && (
                          <motion.div
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="mb-2 inline-flex items-center gap-2 rounded-full border border-line bg-paper-2 py-1 pl-1 pr-3 text-[12px] text-ink-3"
                          >
                            <Avatar
                              name="Writer"
                              size={20}
                              appearance={{ shape: "squircle", eyes: "slant" }}
                              busy={stage === "asking"}
                            />
                            {stage === "asking" ? (
                              <span className="shimmer-text">
                                Asking Writer for a draft…
                              </span>
                            ) : (
                              <span>Writer drafted the announcement</span>
                            )}
                          </motion.div>
                        )}
                        {stage === "thinking" && (
                          <span className="shimmer-text text-[15px]">
                            Thinking…
                          </span>
                        )}
                        {reached(stage, "streaming") && (
                          <p className="leading-relaxed text-ink-2">
                            {reply.slice(0, streamed)}
                            {stage === "streaming" && (
                              <span className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 animate-pulse rounded bg-ink" />
                            )}
                          </p>
                        )}
                        {reached(stage, "approval") && (
                          <Approval approved={stage === "approved"} />
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {/* Composer */}
              <div className="p-4 sm:px-8 sm:pb-6">
                <div className="flex items-center gap-3 rounded-2xl border border-line-strong bg-paper-2 px-4 py-3">
                  <Paperclip className="size-4 shrink-0 text-ink-3" />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[15px]",
                      stage === "typing" && typed ? "text-ink" : "text-ink-3",
                    )}
                  >
                    {stage === "typing" && typed
                      ? ask.slice(0, typed)
                      : "Message Socius"}
                    {stage === "typing" && (
                      <span className="ml-px inline-block h-4 w-px translate-y-0.5 animate-pulse bg-ink" />
                    )}
                  </span>
                  <motion.span
                    animate={{
                      scale:
                        stage === "typing" && typed === ask.length
                          ? [1, 0.85, 1]
                          : 1,
                    }}
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-full transition-colors",
                      stage === "typing" && typed
                        ? "bg-ink text-paper"
                        : "bg-paper-3 text-ink-3",
                    )}
                  >
                    <ArrowUp className="size-4" />
                  </motion.span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
