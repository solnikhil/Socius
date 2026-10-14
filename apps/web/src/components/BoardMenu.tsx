import { useCallback, useState, type FormEvent } from "react";
import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronRight,
  LayoutGrid,
  Pencil,
  Plus,
  Settings,
  UserPlus,
} from "lucide-react";
import type { BotInstance } from "@socius/contracts";
import type { Board } from "@socius/contracts/app";
import { api } from "../api.js";
import { Avatar, ErrorNote, useDismiss } from "./ui.js";
import { useMenuPlacement } from "./menu.js";

/** Right-click menu for a board in the sidebar. */
export function BoardMenu({
  board,
  bots,
  x,
  y,
  onClose,
  onOpen,
  onCreateBot,
  onRefresh,
}: {
  board: Board;
  bots: BotInstance[];
  x: number;
  y: number;
  onClose: () => void;
  onOpen: (tab: "thread" | "team") => void;
  onCreateBot: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [view, setView] = useState<"main" | "add" | "rename">("main"),
    [name, setName] = useState(board.name),
    [error, setError] = useState("");
  const close = useCallback(() => onClose(), [onClose]);
  const ref = useDismiss(true, close);
  const archived = !!board.archivedAt;
  const outside = bots.filter(
    (b) => !board.members.some((m) => m.botId === b.id),
  );
  const position = useMenuPlacement(ref, x, y, view);
  async function run(path: string, body: unknown, done = true) {
    setError("");
    try {
      await api(path, body);
      await onRefresh();
      if (done) onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function rename(e: FormEvent) {
    e.preventDefault();
    if (name.trim() && name.trim() !== board.name)
      void run("boards/update", { id: board.id, name: name.trim() });
    else onClose();
  }
  return (
    <div
      ref={ref}
      className="popover board-menu"
      role="menu"
      aria-label={`${board.name} options`}
      style={position}
      onContextMenu={(e) => e.preventDefault()}
    >
      {view === "main" && (
        <>
          <button role="menuitem" autoFocus onClick={() => onOpen("thread")}>
            <LayoutGrid size={15} />
            Open board
          </button>
          <button
            role="menuitem"
            aria-haspopup="menu"
            disabled={archived}
            onClick={() => setView("add")}
          >
            <UserPlus size={15} />
            Add bots
            <ChevronRight size={14} className="menu-trailing" />
          </button>
          <button role="menuitem" disabled={archived} onClick={onCreateBot}>
            <Plus size={15} />
            New bot on this board
          </button>
          <button role="menuitem" onClick={() => onOpen("team")}>
            <Settings size={15} />
            How this board works
          </button>
          <button
            role="menuitem"
            disabled={archived}
            onClick={() => setView("rename")}
          >
            <Pencil size={15} />
            Rename
          </button>
          <div className="menu-divider" />
          <button
            role="menuitem"
            onClick={() =>
              void run("boards/update", { id: board.id, archived: !archived })
            }
          >
            {archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
            {archived ? "Restore board" : "Archive board"}
          </button>
        </>
      )}
      {view === "add" && (
        <>
          <div className="menu-label">Add to {board.name}</div>
          {outside.length === 0 && (
            <p className="menu-note">Every bot is already on this board.</p>
          )}
          {outside.map((b) => (
            <button
              key={b.id}
              role="menuitem"
              onClick={() =>
                void run(
                  "boards/members",
                  { boardId: board.id, botId: b.id, role: "" },
                  false,
                )
              }
            >
              <Avatar name={b.name} size={20} />
              <span className="menu-bot">
                <strong>{b.name}</strong>
                <small>{b.role}</small>
              </span>
            </button>
          ))}
          {board.members.length > 0 && (
            <>
              <div className="menu-divider" />
              <div className="menu-label">
                On this board · {board.members.length}
              </div>
              {board.members.map((m) => {
                const b = bots.find((x) => x.id === m.botId);
                return (
                  <div key={m.botId} className="menu-member">
                    <Check size={13} />
                    {b?.name ?? "Unavailable bot"}
                  </div>
                );
              })}
            </>
          )}
        </>
      )}
      {view === "rename" && (
        <form className="menu-rename" onSubmit={rename}>
          <label className="menu-label" htmlFor="board-rename">
            Rename board
          </label>
          <input
            id="board-rename"
            value={name}
            maxLength={100}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
          <button className="primary">Save</button>
        </form>
      )}
      <ErrorNote error={error} />
    </div>
  );
}
