import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Magnetic, Scribble, Words } from "../components/motion.js";

export function Closing() {
  // Hovering the button puts Socius to work: its eyes start revolving.
  const [eager, setEager] = useState(false);
  return (
    <section className="relative overflow-hidden px-4 py-28 text-center sm:px-6">
      <div className="dot-grid pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,#000_10%,transparent_65%)]" />
      <motion.div
        initial={{ scale: 0.5, opacity: 0, rotate: 20 }}
        whileInView={{ scale: 1, opacity: 1, rotate: 0 }}
        viewport={{ once: true }}
        transition={{ type: "spring", stiffness: 140, damping: 12 }}
        className="inline-block"
      >
        <Avatar name="Socius" main size={120} busy={eager} />
      </motion.div>
      <h2 className="mx-auto mt-8 max-w-3xl text-[44px] font-bold leading-[1.02] tracking-[-0.035em] text-ink sm:text-[72px]">
        <span className="relative inline-block">
          <Words text="Meet your *ally.*" />
          <Scribble
            className="-bottom-2 left-[2%] h-4 w-[96%] text-n-blue sm:h-5"
            delay={0.8}
          />
        </span>
      </h2>
      <p className="mx-auto mt-6 max-w-lg text-[18px] text-ink-3">
        A private, capable team on your own computer — with you in charge.
      </p>
      <div
        className="mt-9"
        onPointerEnter={() => setEager(true)}
        onPointerLeave={() => setEager(false)}
      >
        <Magnetic>
          <Button
            asChild
            className="group h-13 rounded-xl bg-ink px-7 text-[17px] font-semibold text-paper hover:bg-ink/90"
          >
            <a href="#get">
              Get Socius free
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </a>
          </Button>
        </Magnetic>
      </div>
    </section>
  );
}

export function Footer() {
  const cols: [string, [string, string][]][] = [
    [
      "Product",
      [
        ["Features", "#features"],
        ["How it works", "#how"],
        ["Pricing", "#pricing"],
        ["FAQ", "#faq"],
      ],
    ],
    [
      "Trust",
      [
        ["Privacy", "#privacy"],
        ["Approvals", "#features"],
        ["Activity", "#how"],
      ],
    ],
    [
      "Build",
      [
        ["Source on GitHub", "https://github.com/solnikhil/Socius"],
        ["Get started", "#get"],
      ],
    ],
  ];
  return (
    <footer className="border-t border-line px-4 pb-10 pt-14 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 md:flex-row">
        <div className="max-w-xs">
          <div className="flex items-center gap-2.5 text-ink">
            <Avatar name="Socius" main size={28} />
            <span className="text-[17px] font-semibold tracking-tight">
              Socius
            </span>
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-3">
            Your local AI ally, with private specialist bots and your approval
            on what matters.
          </p>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-8 sm:grid-cols-3 md:justify-items-end">
          {cols.map(([title, links]) => (
            <div key={title}>
              <div className="text-[13px] font-semibold text-ink">{title}</div>
              <ul className="mt-3 space-y-2">
                {links.map(([label, href]) => (
                  <li key={label}>
                    <a
                      href={href}
                      className="text-[14px] text-ink-3 transition-colors hover:text-ink"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-12 flex max-w-6xl flex-col justify-between gap-2 border-t border-line pt-6 text-[13px] text-ink-3 sm:flex-row">
        <span>© 2026 Socius</span>
        <span>
          Provider marks belong to their owners and identify the service only.
        </span>
      </div>
    </footer>
  );
}
