import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, Terminal } from "lucide-react";
import { Eyebrow, Reveal, Words } from "../components/motion.js";

const included = [
  "Socius plus unlimited specialist bots",
  "Group chats, memory and Dreaming",
  "Connect Apps catalog, skills and Notion",
  "Local models at no cost, or your own cloud keys",
  "Phone access over your own Tailscale network",
];

const commands = [
  "git clone https://github.com/solnikhil/Socius.git",
  "cd Socius",
  "npm ci",
  "npm run desktop",
];

function CopyBlock() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(commands.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0f0f0f] text-left shadow-window">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5 text-[12px] text-white/50">
        <Terminal className="size-3.5" /> Terminal · Node.js 24
        <button
          type="button"
          onClick={copy}
          className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={copied ? "y" : "n"}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-1.5"
            >
              {copied ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-7 text-white/85">
        {commands.map((c, i) => (
          <motion.div
            key={c}
            initial={{ opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.25 }}
          >
            <span className="select-none text-[#5e87c9]">$ </span>
            {c}
          </motion.div>
        ))}
      </pre>
    </div>
  );
}

export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <Eyebrow tone="orange">Pricing</Eyebrow>
          </Reveal>
          <h2 className="mt-4 text-[38px] font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[56px]">
            <Words text="Free. *Bring* your own model." />
          </h2>
          <Reveal delay={0.15}>
            <p className="mt-5 text-[18px] leading-relaxed text-ink-3">
              No subscription and no bundled key. Pay your model provider
              directly, or run local models for nothing.
            </p>
          </Reveal>
        </div>

        <div
          id="get"
          className="mt-14 grid scroll-mt-24 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"
        >
          <Reveal>
            <div className="flex h-full flex-col rounded-3xl border border-line bg-paper p-8 shadow-card">
              <div className="flex items-baseline gap-2">
                <span className="text-[56px] font-bold tracking-tight text-ink">
                  $0
                </span>
                <span className="text-ink-3">while in preview</span>
              </div>
              <p className="mt-1 text-[15px] text-ink-3">
                Everything Socius can do today.
              </p>
              <ul className="mt-7 space-y-3">
                {included.map((item, i) => (
                  <motion.li
                    key={item}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 + i * 0.07 }}
                    className="flex items-start gap-3 text-[15px] text-ink-2"
                  >
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-n-green-bg text-n-green">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    {item}
                  </motion.li>
                ))}
              </ul>
              <p className="mt-auto pt-8 text-[13px] leading-relaxed text-ink-3">
                Signed installers and automatic updates are still on the way.
                For now, Socius builds from source on macOS, Windows and Linux.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="relative flex h-full flex-col justify-center overflow-hidden rounded-3xl bg-[#1a1a1a] p-6 sm:p-10">
              <div className="absolute -right-24 -top-24 size-72 rounded-full bg-[radial-gradient(circle,rgba(46,143,232,0.35),transparent_70%)]" />
              <h3 className="relative text-[26px] font-bold tracking-tight text-white">
                Get Socius
              </h3>
              <p className="relative mb-6 mt-2 text-[15px] text-white/55">
                Four commands. The first launch downloads the desktop runtime.
              </p>
              <div className="relative">
                <CopyBlock />
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
