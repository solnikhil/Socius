import { useEffect, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
} from "motion/react";
import { Menu, Moon, Sun, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ease } from "../components/motion.js";

const links = [
  ["Features", "#features"],
  ["How it works", "#how"],
  ["Privacy", "#privacy"],
  ["Pricing", "#pricing"],
  ["FAQ", "#faq"],
] as const;

function useTheme() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  const toggle = () =>
    setDark((d) => {
      try {
        localStorage.setItem("socius-site-theme", d ? "light" : "dark");
      } catch {}
      return !d;
    });
  return { dark, toggle };
}

export function Nav() {
  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30 });
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { dark, toggle } = useTheme();
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 16));

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease }}
      className="fixed inset-x-0 top-0 z-50"
    >
      <div
        className={cn(
          "transition-[background-color,border-color,backdrop-filter] duration-300",
          scrolled || open
            ? "border-b border-line bg-paper/80 backdrop-blur-xl"
            : "border-b border-transparent",
        )}
      >
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <a href="#top" className="flex items-center gap-2.5 text-ink">
            <Avatar name="Socius" main size={28} />
            <span className="text-[17px] font-semibold tracking-tight">
              Socius
            </span>
          </a>
          <div className="hidden flex-1 items-center gap-1 md:flex">
            {links.map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="rounded-md px-3 py-1.5 text-[15px] text-ink-2 transition-colors hover:bg-paper-3 hover:text-ink"
              >
                {label}
              </a>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggle}
              aria-label={dark ? "Use light theme" : "Use dark theme"}
              className="grid size-9 place-items-center rounded-md text-ink-2 transition-colors hover:bg-paper-3 hover:text-ink"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={dark ? "moon" : "sun"}
                  initial={{ rotate: -90, scale: 0.5, opacity: 0 }}
                  animate={{ rotate: 0, scale: 1, opacity: 1 }}
                  exit={{ rotate: 90, scale: 0.5, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  {dark ? (
                    <Moon className="size-[18px]" />
                  ) : (
                    <Sun className="size-[18px]" />
                  )}
                </motion.span>
              </AnimatePresence>
            </button>
            <Button
              asChild
              className="hidden h-9 rounded-lg bg-brand px-4 text-white hover:bg-brand-hover sm:inline-flex"
            >
              <a href="#get">Get Socius</a>
            </Button>
            <button
              type="button"
              className="grid size-9 place-items-center rounded-md text-ink md:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </nav>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease }}
              className="overflow-hidden md:hidden"
            >
              <div className="flex flex-col gap-1 px-4 pb-5">
                {links.map(([label, href], i) => (
                  <motion.a
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    initial={{ x: -12, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.04 * i, ease }}
                    className="rounded-md px-3 py-2.5 text-[17px] font-medium text-ink hover:bg-paper-3"
                  >
                    {label}
                  </motion.a>
                ))}
                <Button
                  asChild
                  className="mt-2 h-11 rounded-lg bg-brand text-white hover:bg-brand-hover"
                >
                  <a href="#get" onClick={() => setOpen(false)}>
                    Get Socius
                  </a>
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <motion.div
        className="h-[2px] origin-left bg-brand"
        style={{ scaleX: progress }}
      />
    </motion.header>
  );
}
