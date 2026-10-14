import { useLayoutEffect, useState, type RefObject } from "react";

/** Places a right-click menu at the pointer, kept inside the window. */
export function useMenuPlacement(
  ref: RefObject<HTMLElement | null>,
  x: number,
  y: number,
  layoutKey: unknown,
) {
  const [position, setPosition] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPosition({
      left: Math.max(8, Math.min(x, innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(y, innerHeight - r.height - 8)),
    });
  }, [ref, x, y, layoutKey]);
  return position;
}
