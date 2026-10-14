import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

const reducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Reveals streamed text at an even, adaptive pace so bursty provider chunks
 * read as a smooth flow. It speeds up when far behind, so it never lags the
 * model by more than a few frames. With reduced motion it shows text as is.
 */
export function useSmoothText(target: string): string {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  useEffect(() => {
    // A new reply (or a different speaker) restarts from what is already there.
    if (!target.startsWith(shownRef.current) || reducedMotion()) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    let frame = 0;
    const step = () => {
      const remaining = target.length - shownRef.current.length;
      if (remaining <= 0) return;
      const take = Math.min(remaining, Math.max(1, Math.ceil(remaining / 10)));
      shownRef.current = target.slice(0, shownRef.current.length + take);
      setShown(shownRef.current);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}

/**
 * Closes a bold or inline-code span the model has opened but not finished,
 * so a half-streamed reply never shows raw `**` or a stray backtick. Fenced
 * code blocks are left alone; the renderer already handles an open fence.
 */
export function closeOpenMarks(text: string): string {
  if ((text.match(/```/g)?.length ?? 0) % 2) return text;
  const open = (s: string) => {
    const prose = s.replace(/```[\s\S]*?```/g, "");
    const code = (prose.replace(/``+/g, "").match(/`/g)?.length ?? 0) % 2 === 1;
    // Bold markers inside an open code span are literal; count only before it.
    const before = code ? prose.slice(0, prose.lastIndexOf("`")) : prose;
    return { code, bold: (before.match(/\*\*/g)?.length ?? 0) % 2 === 1 };
  };
  let t = text,
    o = open(t);
  // A marker that has only just opened would render as an empty span; hide it.
  if (o.code && /[^`]`$/.test(t)) o = open((t = t.slice(0, -1)));
  if (o.bold && t.endsWith("**")) o = open((t = t.slice(0, -2)));
  return t + (o.code ? "`" : "") + (o.bold ? "**" : "");
}

/** How close to the end counts as "at the bottom", in pixels. */
const NEAR = 32;

/**
 * Keeps a scroll container pinned to its newest content only while the
 * reader is already at the bottom. Scrolling up releases the pin at once and
 * never fights the reader; scrolling back to the end pins it again.
 */
export function useStickToBottom(
  scroller: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
) {
  const stuck = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const pin = useCallback(
    (smooth = false) => {
      const el = scroller.current;
      if (!el) return;
      stuck.current = true;
      setAtBottom(true);
      el.scrollTo({
        top: el.scrollHeight,
        behavior: smooth && !reducedMotion() ? "smooth" : "auto",
      });
    },
    [scroller],
  );
  useEffect(() => {
    const el = scroller.current,
      inner = content.current;
    if (!el || !inner) return;
    const distance = () => el.scrollHeight - el.scrollTop - el.clientHeight;
    const onScroll = () => {
      const near = distance() <= NEAR;
      // Only reaching the end re-pins; leaving is handled by intent below.
      if (near) stuck.current = true;
      setAtBottom(near);
    };
    // Any upward intent releases the pin before new content can pull it back.
    const release = () => {
      stuck.current = false;
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) release();
    };
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowUp", "PageUp", "Home"].includes(e.key)) release();
    };
    const grew = new ResizeObserver(() => {
      if (stuck.current) el.scrollTop = el.scrollHeight;
      else setAtBottom(distance() <= NEAR);
    });
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchmove", release, { passive: true });
    el.addEventListener("keydown", onKey);
    grew.observe(inner);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchmove", release);
      el.removeEventListener("keydown", onKey);
      grew.disconnect();
    };
  }, [scroller, content]);
  return { atBottom, pin };
}
