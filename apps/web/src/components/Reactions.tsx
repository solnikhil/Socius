import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { SmilePlus } from "lucide-react";
import { REACTIONS, type Reaction } from "@socius/contracts/app";

const ORDER = Object.keys(REACTIONS) as Reaction[];
/** Room the picker needs above its trigger before it flips below. */
const ROOM = 96;
const label = (r: Reaction) =>
  REACTIONS[r].charAt(0).toUpperCase() + REACTIONS[r].slice(1);

/**
 * The react button beside a bot reply and its pill of reactions. Picking the
 * current reaction again clears it. Arrow keys move, 1–6 pick, Escape closes
 * and returns focus to the button.
 */
export function ReactionPicker({
  current,
  open,
  onToggle,
  onPick,
}: {
  current: Reaction | undefined;
  open: boolean;
  onToggle: (open: boolean) => void;
  onPick: (reaction: Reaction) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null),
    pill = useRef<HTMLDivElement>(null),
    [below, setBelow] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.(".reactions")) onToggle(false);
    };
    document.addEventListener("pointerdown", close);
    // Start on the current reaction so Enter keeps or clears it.
    const start = current ? ORDER.indexOf(current) : 0;
    pill.current?.querySelectorAll("button")[start]?.focus();
    return () => document.removeEventListener("pointerdown", close);
    // Only opening matters; the current reaction is read once to place focus.
  }, [open]);
  const toggle = () => {
    const el = trigger.current;
    if (!open && el) {
      // Flip below when the reply sits at the top of the scrolling thread.
      const top = el.closest(".chat-scroll")?.getBoundingClientRect().top;
      setBelow(el.getBoundingClientRect().top - (top ?? 0) < ROOM);
    }
    onToggle(!open);
  };
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    const buttons = [...(pill.current?.querySelectorAll("button") ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => {
      e.preventDefault();
      buttons[(to + buttons.length) % buttons.length]?.focus();
    };
    if (e.key === "ArrowRight") move(at + 1);
    else if (e.key === "ArrowLeft") move(at - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(buttons.length - 1);
    else if (/^[1-6]$/.test(e.key)) {
      e.preventDefault();
      onPick(ORDER[Number(e.key) - 1]!);
    } else if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.preventDefault();
      onToggle(false);
      trigger.current?.focus();
    }
  };
  return (
    <div className="reactions">
      <button
        ref={trigger}
        className="icon ghost tiny react-trigger"
        aria-label="React"
        aria-haspopup="menu"
        aria-expanded={open}
        title="React"
        onClick={toggle}
      >
        <SmilePlus size={15} />
      </button>
      {open && (
        <div
          ref={pill}
          className={`reaction-picker ${below ? "below" : ""}`}
          role="menu"
          aria-label="Reactions"
          onKeyDown={keys}
        >
          {ORDER.map((r, n) => (
            <button
              key={r}
              role="menuitemradio"
              aria-checked={current === r}
              aria-label={`React ${r}: ${REACTIONS[r]}${current === r ? " (tap to remove)" : ""}`}
              data-label={current === r ? "Remove" : label(r)}
              className={current === r ? "chosen" : ""}
              style={{ animationDelay: `${n * 22}ms` }}
              onClick={() => onPick(r)}
            >
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
