import { useEffect, useRef, useState, type ReactNode } from "react";
import { FolderPlus, Plus, Users, X } from "lucide-react";
import type { BotInstance } from "@socius/contracts";
import type { GroupChat } from "@socius/contracts/app";
import { Avatar, GroupAvatar } from "../components/chrome.js";

type Option = { key: string; label: string; icon: ReactNode; run: () => void };

export function NewChat({
  bots,
  groups,
  mainId,
  onClose,
  onPick,
  onPickGroup,
  onCreate,
  onCreateGroup,
  onCreateCategory,
}: {
  bots: BotInstance[];
  groups: { group: GroupChat; faces: { name: string; main?: boolean }[] }[];
  mainId: string;
  onClose: () => void;
  onPick: (bot: BotInstance) => void;
  onPickGroup: (group: GroupChat) => void;
  onCreate: () => void;
  onCreateGroup: () => void;
  onCreateCategory: () => void;
}) {
  const [query, setQuery] = useState(""),
    [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();
  const options: Option[] = [
    ...(q
      ? []
      : [
          {
            key: "create",
            label: "Create new bot",
            icon: <Plus size={16} />,
            run: onCreate,
          },
          {
            key: "create-group",
            label: "Create group chat",
            icon: <Users size={16} />,
            run: onCreateGroup,
          },
          {
            key: "create-category",
            label: "Create category",
            icon: <FolderPlus size={16} />,
            run: onCreateCategory,
          },
        ]),
    ...bots
      .filter((b) => `${b.name} ${b.role}`.toLowerCase().includes(q))
      .map((b) => ({
        key: b.id,
        label: b.name,
        icon: (
          <Avatar
            name={b.name}
            main={b.id === mainId}
            size={22}
            appearance={b.appearance}
          />
        ),
        run: () => onPick(b),
      })),
    ...groups
      .filter(({ group, faces }) =>
        `${group.name} ${faces.map((f) => f.name).join(" ")}`
          .toLowerCase()
          .includes(q),
      )
      .map(({ group, faces }) => ({
        key: group.id,
        label: group.name,
        icon: <GroupAvatar names={faces} size={22} />,
        run: () => onPickGroup(group),
      })),
  ];
  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !/^[1-9]$/.test(e.key)) return;
      const option = options[Number(e.key) - 1];
      if (option) {
        e.preventDefault();
        option.run();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });
  return (
    <div className="new-chat">
      <header className="to-bar drag">
        <label>
          <span>To:</span>
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="recipient-list"
            aria-label="Start a chat with"
            placeholder="Start a chat with..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, options.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                options[active]?.run();
              } else if (e.key === "Escape") onClose();
            }}
          />
        </label>
        <button
          className="icon ghost"
          aria-label="Close new chat"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>
      <div className="palette" id="recipient-list" role="listbox" ref={list}>
        {options.map((o, i) => (
          <button
            key={o.key}
            role="option"
            data-index={i}
            aria-selected={i === active}
            className={i === active ? "active" : ""}
            onMouseMove={() => setActive(i)}
            onClick={o.run}
          >
            <span className="palette-icon">{o.icon}</span>
            {o.label}
            {i < 9 && (
              <span className="kbd">
                <kbd>⌘</kbd>
                <kbd>{i + 1}</kbd>
              </span>
            )}
          </button>
        ))}
        {options.length === 0 && (
          <div className="palette-empty">No bots match “{query}”.</div>
        )}
      </div>
      <div className="composer-wrap">
        <div className="composer disabled" aria-hidden="true">
          <span className="icon round composer-plus">
            <Plus size={18} />
          </span>
          <span className="placeholder">Message Bot</span>
        </div>
      </div>
    </div>
  );
}
