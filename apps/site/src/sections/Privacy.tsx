import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import {
  BadgeCheck,
  EyeOff,
  FileLock2,
  HardDrive,
  KeyRound,
  PackageCheck,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import {
  CountUp,
  Eyebrow,
  Reveal,
  Spotlight,
  Words,
} from "../components/motion.js";

const points = [
  {
    icon: <KeyRound className="size-5" />,
    title: "Keys stay in your keychain",
    body: "Cloud keys are encrypted with your OS. The window you chat in never receives one.",
  },
  {
    icon: <HardDrive className="size-5" />,
    title: "Your data lives on your disk",
    body: "Chats and tasks in local SQLite, memory as Markdown files you can read, back up or delete.",
  },
  {
    icon: <EyeOff className="size-5" />,
    title: "No analytics, no crash uploads",
    body: "There is no account and no telemetry. Activity is recorded locally, without keys or error bodies.",
  },
  {
    icon: <BadgeCheck className="size-5" />,
    title: "Exact approvals, run once",
    body: "Every external write is shown exactly as it will run, bound to a digest, and can't be approved twice.",
  },
  {
    icon: <PackageCheck className="size-5" />,
    title: "Packages can't run on preview",
    body: "Installs show source, digest, dependencies and permissions. Nothing executes while you look.",
  },
  {
    icon: <FileLock2 className="size-5" />,
    title: "Loopback only, paired",
    body: "The local API listens only on your machine and requires a one-time pairing.",
  },
];

const stats = [
  { to: 29, suffix: "", label: "model providers" },
  { to: 0, suffix: "", label: "analytics events sent" },
  { to: 256, suffix: "-bit", label: "phone session tokens" },
  { to: 5, suffix: " min", label: "pairing code lifetime" },
];

export function Privacy() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const radius = useTransform(scrollYProgress, [0, 0.3], [64, 28]);
  const inset = useTransform(scrollYProgress, [0, 0.3], ["4%", "0%"]);

  return (
    <section id="privacy" ref={ref} className="scroll-mt-20 px-2 py-10 sm:px-4">
      <motion.div
        style={{ borderRadius: radius, marginInline: inset }}
        className="relative overflow-hidden bg-[#111111] px-5 py-24 text-white sm:px-10"
      >
        <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,#000_30%,transparent_75%)]" />
        <div className="relative mx-auto max-w-6xl">
          <div className="grid items-end gap-10 lg:grid-cols-[1.3fr_1fr]">
            <div>
              <Reveal>
                <Eyebrow tone="green">Privacy</Eyebrow>
              </Reveal>
              <h2 className="mt-4 text-[38px] font-bold leading-[1.05] tracking-[-0.03em] sm:text-[60px]">
                <Words text="Private by *design,* not by promise." />
              </h2>
            </div>
            <Reveal delay={0.2}>
              <div className="flex items-center gap-4">
                <div className="[--main-avatar:#f5f5f5] [--main-avatar-eyes:#111]">
                  <Avatar name="Socius" main size={64} />
                </div>
                <p className="text-[17px] leading-relaxed text-white/60">
                  Model providers you connect receive the context you send them.
                  Beyond that, nothing leaves your computer unless you approve
                  it.
                </p>
              </div>
            </Reveal>
          </div>

          <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {points.map((p, i) => (
              <Reveal key={p.title} delay={(i % 3) * 0.08} y={20}>
                <Spotlight className="h-full bg-[#111111] p-7 [--ink:#fff]">
                  <span className="grid size-10 place-items-center rounded-xl bg-white/10 text-white">
                    {p.icon}
                  </span>
                  <h3 className="mt-5 text-[18px] font-semibold">{p.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-white/55">
                    {p.body}
                  </p>
                </Spotlight>
              </Reveal>
            ))}
          </div>

          <div className="mt-14 grid grid-cols-2 gap-8 lg:grid-cols-4">
            {stats.map((s, i) => (
              <Reveal key={s.label} delay={i * 0.08}>
                <div className="border-t border-white/15 pt-5">
                  <div className="text-[44px] font-bold tracking-tight sm:text-[56px]">
                    <CountUp to={s.to} suffix={s.suffix} />
                  </div>
                  <div className="text-[14px] text-white/50">{s.label}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
