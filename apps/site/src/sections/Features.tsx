import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BookOpenText,
  Check,
  Command,
  FileClock,
  Globe,
  Hand,
  LayoutTemplate,
  Moon,
  MousePointer2,
  Search,
  FileText,
  SunMoon,
} from "lucide-react";
import type { BotAppearance } from "@socius/contracts/appearance";
import notion from "@/assets/connectors/notion.svg?url";
import mcp from "@lobehub/icons-static-svg/icons/mcp.svg?url";
import { Avatar } from "@/components/avatar";
import { cn } from "@/lib/utils";
import {
  Eyebrow,
  Reveal,
  Spotlight,
  Words,
  ease,
} from "../components/motion.js";

function Card({
  title,
  body,
  tone,
  badge,
  className,
  children,
  delay = 0,
}: {
  title: string;
  body: string;
  tone: string;
  badge?: string;
  className?: string;
  children: ReactNode;
  delay?: number;
}) {
  return (
    <Reveal delay={delay} className={className}>
      <Spotlight
        className={cn(
          "group flex h-full flex-col overflow-hidden rounded-3xl border border-line p-6 transition-shadow duration-500 hover:shadow-window sm:p-7",
          tone,
        )}
      >
        <div className="relative mb-6 flex min-h-[200px] flex-1 items-center justify-center">
          {children}
        </div>
        <div className="flex items-center gap-2">
          <h3 className="text-[20px] font-semibold tracking-tight text-ink">
            {title}
          </h3>
          {badge && (
            <span className="rounded-md bg-paper/70 px-1.5 py-0.5 text-[11px] font-medium text-ink-3">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-1.5 max-w-md text-[15px] leading-relaxed text-ink-3">
          {body}
        </p>
      </Spotlight>
    </Reveal>
  );
}

/** Cycles 0…n-1 forever, for looping illustrations. */
function useCycle(n: number, ms: number) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % n), ms);
    return () => clearInterval(t);
  }, [n, ms]);
  return i;
}

const team: {
  name: string;
  role: string;
  look?: BotAppearance;
  main?: boolean;
}[] = [
  { name: "Socius", role: "Coordinates", main: true },
  {
    name: "Researcher",
    role: "Read-only web",
    look: { shape: "blob", eyes: "pupils" },
  },
  {
    name: "Writer",
    role: "Notion write",
    look: { shape: "squircle", eyes: "slant" },
  },
  { name: "Analyst", role: "Memory on", look: { shape: "hex", eyes: "dots" } },
  {
    name: "Planner",
    role: "No tools",
    look: { shape: "wide", eyes: "cyclops" },
  },
];

function TeamVisual() {
  const active = useCycle(team.length, 1300);
  return (
    <div className="flex flex-wrap items-end justify-center gap-4 sm:gap-6">
      {team.map((b, i) => (
        <motion.div
          key={b.name}
          className="flex flex-col items-center gap-2"
          animate={{ y: active === i ? -10 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 14 }}
        >
          <Avatar
            name={b.name}
            main={!!b.main}
            size={b.main ? 72 : 56}
            appearance={b.look}
            busy={active === i}
          />
          <span className="text-[13px] font-semibold text-ink">{b.name}</span>
          <span className="rounded-md bg-paper/80 px-1.5 py-0.5 text-[11px] text-ink-3">
            {b.role}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

const notes = [
  "## Preferences",
  "- Prefers short, direct drafts",
  "- Weekly review on Fridays",
  "## Launch",
  "- Announcement goes out Thursday",
];

function MemoryVisual() {
  return (
    <div className="w-full max-w-[300px] rounded-xl border border-line bg-paper p-4 font-mono text-[12px] shadow-card">
      <div className="mb-3 flex items-center gap-2 text-ink-3">
        <BookOpenText className="size-3.5" /> writer/memory/notes.md
      </div>
      {notes.map((line, i) => (
        <motion.div
          key={line}
          className={cn(
            "overflow-hidden whitespace-nowrap",
            line.startsWith("#")
              ? "mt-2 font-semibold text-ink first:mt-0"
              : "text-ink-2",
          )}
          initial={{ width: 0 }}
          whileInView={{ width: "100%" }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.3 + i * 0.35, ease: "linear" }}
        >
          {line}
        </motion.div>
      ))}
      <div className="mt-3 flex items-center gap-2 rounded-md bg-paper-2 px-2 py-1.5 text-ink-3">
        <Search className="size-3" /> full-text search
      </div>
    </div>
  );
}

const actions = [
  "Create page “Launch announcement”",
  "Click “Submit” on example.com",
  "Save note to Writer’s memory",
];

function ApprovalVisual() {
  const done = useCycle(actions.length + 1, 1200);
  return (
    <div className="w-full max-w-[300px] space-y-2">
      {actions.map((a, i) => (
        <div
          key={a}
          className="flex items-center gap-3 rounded-xl border border-line bg-paper px-3 py-2.5 text-[13px] text-ink-2 shadow-card"
        >
          <motion.span
            animate={{
              backgroundColor: done > i ? "var(--c-green)" : "rgba(0,0,0,0)",
              borderColor: done > i ? "var(--c-green)" : "var(--line-strong)",
            }}
            className="grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] text-white"
          >
            <AnimatePresence>
              {done > i && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                >
                  <Check className="size-3" strokeWidth={3} />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.span>
          <span className="truncate">{a}</span>
        </div>
      ))}
    </div>
  );
}

const thread: {
  who: string;
  look?: BotAppearance;
  main?: boolean;
  text: string;
}[] = [
  { who: "Socius", main: true, text: "Analyst, how did Q3 signups compare?" },
  {
    who: "Analyst",
    look: { shape: "hex", eyes: "dots" },
    text: "Up 18%, mostly from the referral push.",
  },
  {
    who: "Writer",
    look: { shape: "squircle", eyes: "slant" },
    text: "Drafted a two-line summary for the update.",
  },
  {
    who: "Socius",
    main: true,
    text: "Here's the combined answer, with both sources.",
  },
];

function GroupVisual() {
  const shown = useCycle(thread.length + 2, 1400);
  return (
    <div className="w-full max-w-md space-y-2.5">
      <AnimatePresence initial={false}>
        {thread.slice(0, Math.min(shown, thread.length)).map((m, i) => (
          <motion.div
            key={i}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
            transition={{ duration: 0.5, ease }}
            className="flex items-start gap-2.5"
          >
            <Avatar
              name={m.who}
              main={!!m.main}
              size={28}
              appearance={m.look}
            />
            <div className="rounded-2xl rounded-tl-md border border-line bg-paper px-3.5 py-2 text-[13px] shadow-card">
              <div className="text-[11px] font-semibold text-ink-3">
                {m.who}
              </div>
              <div className="text-ink-2">{m.text}</div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function DreamVisual() {
  const stars = [
    [12, 18],
    [78, 12],
    [88, 52],
    [20, 70],
    [55, 8],
    [66, 80],
    [8, 44],
    [42, 88],
  ];
  return (
    <div className="relative h-[200px] w-full">
      {stars.map(([x, y], i) => (
        <motion.span
          key={i}
          className="absolute size-1 rounded-full bg-white"
          style={{ left: `${x}%`, top: `${y}%` }}
          animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.3, 0.8] }}
          transition={{
            duration: 2 + (i % 3),
            repeat: Infinity,
            delay: i * 0.3,
          }}
        />
      ))}
      <Moon className="absolute right-[12%] top-[10%] size-8 fill-[#f6e7a8] text-[#f6e7a8]" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="[--main-avatar:#f5f5f5] [--main-avatar-eyes:#1d2233]">
          <Avatar
            name="Socius"
            main
            size={88}
            appearance={{ shape: "round", eyes: "sleepy" }}
          />
        </div>
        {["z", "z", "Z"].map((z, i) => (
          <motion.span
            key={i}
            className="absolute font-serif text-[22px] italic text-white/80"
            style={{ left: "88%", top: "0%" }}
            animate={{
              x: [0, 18 + i * 8],
              y: [0, -40 - i * 10],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              delay: i * 1,
              ease: "easeOut",
            }}
          >
            {z}
          </motion.span>
        ))}
      </div>
    </div>
  );
}

function ConnectVisual() {
  const tiles = [
    { label: "Notion", img: notion, tag: "Connector" },
    { label: "MCP Registry", img: mcp, tag: "Browse", mask: true },
    {
      label: "SKILL.md",
      icon: <FileClock className="size-5" />,
      tag: "Agent Skills",
    },
    {
      label: "Templates",
      icon: <LayoutTemplate className="size-5" />,
      tag: "Bots",
    },
  ];
  return (
    <div className="grid w-full max-w-[320px] grid-cols-2 gap-3">
      {tiles.map((t, i) => (
        <motion.div
          key={t.label}
          initial={{ opacity: 0, scale: 0.8, rotate: i % 2 ? 6 : -6 }}
          whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
          viewport={{ once: true }}
          whileHover={{ y: -4, rotate: i % 2 ? 2 : -2 }}
          transition={{
            type: "spring",
            stiffness: 260,
            damping: 18,
            delay: i * 0.08,
          }}
          className="flex flex-col gap-2 rounded-2xl border border-line bg-paper p-3 shadow-card"
        >
          <span className="grid size-9 place-items-center rounded-xl border border-line bg-paper-2 text-ink">
            {t.img ? (
              t.mask ? (
                <span
                  className="block size-5 bg-ink"
                  style={{
                    mask: `url("${t.img}") center/contain no-repeat`,
                    WebkitMask: `url("${t.img}") center/contain no-repeat`,
                  }}
                />
              ) : (
                <img src={t.img} alt="" className="size-5" />
              )
            ) : (
              t.icon
            )}
          </span>
          <div className="text-[13px] font-semibold text-ink">{t.label}</div>
          <div className="text-[11px] text-ink-3">{t.tag}</div>
        </motion.div>
      ))}
    </div>
  );
}

function BrowserVisual() {
  return (
    <div className="w-full max-w-[320px] overflow-hidden rounded-xl border border-line bg-paper shadow-card">
      <div className="flex items-center gap-1.5 border-b border-line bg-paper-2 px-3 py-2">
        <span className="size-2 rounded-full bg-line-strong" />
        <span className="size-2 rounded-full bg-line-strong" />
        <span className="size-2 rounded-full bg-line-strong" />
        <span className="ml-2 flex flex-1 items-center gap-1.5 rounded-md bg-paper px-2 py-0.5 text-[11px] text-ink-3">
          <Globe className="size-3" /> docs.example.com
        </span>
      </div>
      <div className="relative space-y-2 p-4">
        <div className="h-3 w-2/3 rounded bg-paper-3" />
        <div className="h-2 w-full rounded bg-paper-3" />
        <div className="h-2 w-5/6 rounded bg-paper-3" />
        <motion.div
          className="h-2 w-3/4 rounded bg-n-yellow-bg"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2.4, repeat: Infinity }}
        />
        <div className="h-2 w-1/2 rounded bg-paper-3" />
        <div className="flex items-center justify-between pt-2">
          <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
            <Avatar
              name="Researcher"
              size={18}
              appearance={{ shape: "blob", eyes: "pupils" }}
              busy
            />
            Researcher is reading
          </span>
          <span className="flex items-center gap-1 rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-paper">
            <Hand className="size-3" /> Take control
          </span>
        </div>
        <motion.div
          className="absolute"
          animate={{
            left: ["20%", "70%", "45%", "20%"],
            top: ["20%", "35%", "60%", "20%"],
          }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <MousePointer2 className="size-4 fill-ink text-paper" />
        </motion.div>
      </div>
    </div>
  );
}

/** A QR-looking 21×21 grid: three finder squares and a stable scatter of modules. */
const qr = Array.from({ length: 21 * 21 }, (_, i) => {
  const x = i % 21,
    y = Math.floor(i / 21);
  const finder = (fx: number, fy: number) => {
    const dx = x - fx,
      dy = y - fy;
    if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return null;
    const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
    return ring !== 2;
  };
  const f = finder(0, 0) ?? finder(14, 0) ?? finder(0, 14);
  if (f !== null) return f;
  if ((x === 7 || y === 7) && (x < 8 || y < 8)) return false;
  if (x === 13 && y < 8) return false;
  if (y === 13 && x < 8) return false;
  return (x * 7 + y * 13 + x * y * 3) % 5 < 2;
});

function PhoneVisual() {
  return (
    <div className="relative h-[210px] w-[120px] rounded-[26px] border-[5px] border-ink bg-paper p-3 shadow-window">
      <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-ink/80" />
      <div className="relative mx-auto grid w-[80px] grid-cols-[repeat(21,1fr)] overflow-hidden rounded-sm bg-white p-1">
        {qr.map((on, i) => (
          <span key={i} className={cn("aspect-square", on && "bg-[#111]")} />
        ))}
        <span
          className="absolute inset-x-0 h-[2px] bg-n-pink shadow-[0_0_10px_var(--c-pink)]"
          style={{ animation: "scan 2.4s ease-in-out infinite" }}
        />
      </div>
      <div className="mt-3 text-center text-[10px] font-medium text-ink-2">
        Pair this phone
      </div>
      <div className="mt-1 text-center font-mono text-[10px] tracking-widest text-ink-3">
        482 913
      </div>
    </div>
  );
}

const extras = [
  {
    icon: <Command className="size-4" />,
    text: "Keyboard-first: ⌘K, ⌘N, ⌘1–9",
  },
  {
    icon: <SunMoon className="size-4" />,
    text: "Light and dark, following your system",
  },
  {
    icon: <FileClock className="size-4" />,
    text: "A local Activity record of everything",
  },
  {
    icon: <FileText className="size-4" />,
    text: "Attach notes and save replies as Markdown",
  },
];

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 px-4 pb-24 pt-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <Eyebrow>Features</Eyebrow>
          </Reveal>
          <h2 className="mt-4 text-[38px] font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[56px]">
            <Words text="A small team that *knows* you." />
          </h2>
          <Reveal delay={0.2}>
            <p className="mx-auto mt-5 max-w-2xl text-[18px] leading-relaxed text-ink-3">
              Socius is your main ally. Add specialists for the work you repeat,
              and each one gets exactly the tools, memory and permissions you
              give it.
            </p>
          </Reveal>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-6">
          <Card
            className="md:col-span-4"
            tone="bg-n-blue-bg"
            title="Specialists, not one giant chatbot"
            body="Create bots by hand, install templates, or let Socius propose one. You review the role and instructions first, and every new bot starts with no inherited memory or permissions."
          >
            <TeamVisual />
          </Card>
          <Card
            className="md:col-span-2"
            tone="bg-n-yellow-bg"
            delay={0.08}
            title="Memory you can open"
            body="Private per bot, stored as plain Markdown on your disk. Edit it in any editor. Saves proposed by a bot wait for your review."
          >
            <MemoryVisual />
          </Card>
          <Card
            className="md:col-span-2"
            tone="bg-n-green-bg"
            title="Approve exactly what runs"
            body="Writes, clicks and saves show you the exact action first. Approvals survive a restart and run once — never twice."
          >
            <ApprovalVisual />
          </Card>
          <Card
            className="md:col-span-4"
            tone="bg-n-purple-bg"
            delay={0.08}
            title="Group chats, coordinated"
            body="Pick a few bots and Socius runs the conversation. It knows each member's role, asks them for help, and answers last. Everyone speaks with their own permissions."
          >
            <GroupVisual />
          </Card>
          <Card
            className="md:col-span-3 [&_h3]:text-white [&_p]:text-white/65"
            tone="bg-[#1d2233] border-transparent"
            badge="Opt-in"
            title="Dreaming"
            body="While Socius sits idle, a model you choose turns finished chats into tidy memory notes for each bot, and cites where every note came from. Delete a note and its source is never reused."
          >
            <DreamVisual />
          </Card>
          <Card
            className="md:col-span-3"
            tone="bg-n-orange-bg"
            delay={0.08}
            title="Connect Apps"
            body="One catalog for skills, connectors and bot templates. Sign in to Notion over its official MCP server, import standard Agent Skills, and see exactly what a package asks for before it installs."
          >
            <ConnectVisual />
          </Card>
          <Card
            className="md:col-span-3"
            tone="bg-n-gray-bg"
            badge="Preview"
            title="A browser you can watch"
            body="Give a bot browsing and it researches public pages in its own visible window. Take control to sign in, then hand it back. Private and local addresses are blocked."
          >
            <BrowserVisual />
          </Card>
          <Card
            className="md:col-span-3"
            tone="bg-n-pink-bg"
            delay={0.08}
            badge="Preview"
            title="Your laptop, from your phone"
            body="Pair a phone over your private Tailscale network with a QR code or six-digit code. It drives the same running workspace, and you can revoke it in one click."
          >
            <PhoneVisual />
          </Card>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {extras.map((e, i) => (
            <Reveal key={e.text} delay={i * 0.06}>
              <div className="flex h-full items-center gap-3 rounded-2xl border border-line px-4 py-3.5 text-[14px] text-ink-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-paper-3 text-ink">
                  {e.icon}
                </span>
                {e.text}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
