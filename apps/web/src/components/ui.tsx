import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Star, X } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";

export const MAIN_BOT_TEMPLATE = "socius/main";

const hash = (text: string) => {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};
const colors = [
  "#3b82f6",
  "#a26d3f",
  "#46c36b",
  "#ec4f9c",
  "#2ec4b6",
  "#ef4444",
  "#f2a33a",
  "#8b5cf6",
];
// Each shape is drawn in a 40×40 box; the eyes sit in the upper right.
const shapes = [
  <circle key="c" cx="20" cy="21" r="17" />,
  <rect key="r" x="3" y="4" width="34" height="34" rx="13" />,
  <path
    key="e"
    d="M21 3.5c9.4 0 16 7.6 16 17.2 0 9.8-7 16.3-17.2 16.3C9.6 37 3 30.6 3 21.4 3 11.2 11 3.5 21 3.5z"
  />,
  <path
    key="h"
    d="M15 4.5h11.5a6 6 0 0 1 5.3 3.2l5 9.6a6 6 0 0 1 0 5.6l-5 9.6a6 6 0 0 1-5.3 3.2H15a6 6 0 0 1-5.3-3.2l-5-9.6a6 6 0 0 1 0-5.6l5-9.6A6 6 0 0 1 15 4.5z"
  />,
  <ellipse key="o" cx="20" cy="22" rx="18" ry="14.5" />,
];

export function botColor(name: string) {
  return colors[hash(name) % colors.length]!;
}

export function Avatar({
  name,
  main = false,
  size = 36,
  badge = false,
}: {
  name: string;
  main?: boolean;
  size?: number;
  badge?: boolean;
}) {
  const h = hash(name);
  return (
    <span
      className={`avatar ${main ? "main" : ""}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 40 40" width={size} height={size}>
        <g fill={main ? "var(--main-avatar)" : botColor(name)}>
          {main ? shapes[0] : shapes[(h >>> 8) % shapes.length]}
        </g>
        <g fill={main ? "var(--main-avatar-eyes)" : "rgba(0,0,0,0.82)"}>
          <rect
            x="18.5"
            y="11"
            width="3.6"
            height="7.6"
            rx="1.8"
            transform="rotate(-14 20 15)"
          />
          <rect
            x="26.5"
            y="12.4"
            width="3.6"
            height="7.6"
            rx="1.8"
            transform="rotate(-14 28 16)"
          />
        </g>
      </svg>
      {badge && (
        <span className="avatar-badge">
          <Star size={size * 0.13} fill="currentColor" strokeWidth={0} />
        </span>
      )}
    </span>
  );
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Modal({
  title,
  children,
  onClose,
  className = "",
  hideTitle = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  hideTitle?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      className={className}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => closeOnBackdrop(e, onClose)}
    >
      <div className="modal-head">
        <h2 id={id} className={hideTitle ? "sr-only" : ""}>
          {title}
        </h2>
        <button
          className="icon ghost"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

/** Closes a modal dialog when its backdrop, not its padding, is clicked. */
export function closeOnBackdrop(
  e: ReactMouseEvent<HTMLDialogElement>,
  close: () => void,
) {
  if (e.target !== e.currentTarget) return;
  const r = e.currentTarget.getBoundingClientRect();
  if (
    e.clientX < r.left ||
    e.clientX > r.right ||
    e.clientY < r.top ||
    e.clientY > r.bottom
  )
    close();
}

export function ErrorNote({
  error,
  action,
}: {
  error: string;
  /** Optional recovery step shown beside the message. */
  action?: { label: string; onClick: () => void } | undefined;
}) {
  return error ? (
    <div className="error" role="alert">
      <span>{error}</span>
      {action && (
        <button type="button" className="error-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  ) : null;
}

/** Closes a popover when the user clicks elsewhere or presses Escape. */
export function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", click);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", click);
      document.removeEventListener("keydown", key);
    };
  }, [open, close]);
  return ref;
}

export type ThemePreference = "system" | "light" | "dark";
const THEME_KEY = "socius.theme";
function readTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readTheme);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark =
        preference === "dark" || (preference === "system" && media.matches);
      const root = document.documentElement;
      // Swap every colour at once instead of animating stale button colours.
      root.classList.add("theme-switching");
      root.dataset.theme = dark ? "dark" : "light";
      requestAnimationFrame(() =>
        requestAnimationFrame(() => root.classList.remove("theme-switching")),
      );
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", dark ? "#111111" : "#ffffff");
    };
    apply();
    media.addEventListener("change", apply);
    try {
      if (preference === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, preference);
    } catch {
      // Storage can be unavailable; the theme still applies for this session.
    }
    return () => media.removeEventListener("change", apply);
  }, [preference]);
  return [preference, setPreference] as const;
}

// Minimal Markdown: paragraphs, headings, lists, fences and inline emphasis.
// Builds React elements only, so model output can never inject HTML.
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0,
    match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${match.index}`;
    if (token.startsWith("**"))
      out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`"))
      out.push(<code key={key}>{token.slice(1, -1)}</code>);
    else out.push(<em key={key}>{token.slice(1, -1)}</em>);
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```"))
        code.push(lines[i++]!);
      i++;
      blocks.push(
        <pre key={blocks.length}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(
        <p key={blocks.length} className="md-heading">
          {inline(heading[1]!)}
        </p>,
      );
      i++;
      continue;
    }
    const bullet = /^\s*([-*•]|\d+[.)])\s+/;
    if (bullet.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while (i < lines.length && bullet.test(lines[i]!))
        items.push(lines[i++]!.replace(bullet, ""));
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={blocks.length}>
          {items.map((item, n) => (
            <li key={n}>{inline(item)}</li>
          ))}
        </List>,
      );
      continue;
    }
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !bullet.test(lines[i]!) &&
      !lines[i]!.startsWith("```") &&
      !/^#{1,6}\s/.test(lines[i]!)
    )
      paragraph.push(lines[i++]!);
    blocks.push(
      <p key={blocks.length}>
        {paragraph.map((p, n) => (
          <Fragment key={n}>
            {n > 0 && <br />}
            {inline(p)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <div className="markdown">{blocks}</div>;
}
