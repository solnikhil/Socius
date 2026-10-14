import { useCallback, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  Crown,
  LayoutGrid,
  LogOut,
  MessageCircle,
  Plus,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import type { BotInstance } from "@socius/contracts";
import type { Board } from "@socius/contracts/app";
import { api } from "../api.js";
import { ErrorNote, useDismiss } from "./ui.js";
import { useMenuPlacement } from "./menu.js";

/** Right-click menu for a bot in the sidebar. */
export function BotMenu({
  bot,
  boards,
  x,
  y,
  onClose,
  onChat,
  onMemory,
  onNewBoard,
  onRefresh,
}: {
  bot: BotInstance;
  boards: Board[];
  x: number;
  y: number;
  onClose: () => void;
  onChat: () => void;
  onMemory: () => void;
  onNewBoard: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [view, setView] = useState<"main" | "add" | "remove">("main"),
    [error, setError] = useState("");
  const close = useCallback(() => onClose(), [onClose]);
  const ref = useDismiss(true, close);
  const position = useMenuPlacement(ref, x, y, view);
  const open = boards.filter((b) => !b.archivedAt);
  const on = open.filter((b) => b.members.some((m) => m.botId === bot.id));
  const off = open.filter((b) => !b.members.some((m) => m.botId === bot.id));
  const memory = bot.grantedCapabilities.includes("memory.read");
  async function run(path: string, body: unknown, method?: string) {
    setError("");
    try {
      await api(path, body, method);
      await onRefresh();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div
      ref={ref}
      className="popover board-menu"
      role="menu"
      aria-label={`${bot.name} options`}
      style={position}
      onContextMenu={(e) => e.preventDefault()}
    >
      {view === "main" && (
        <>
          <button role="menuitem" autoFocus onClick={onChat}>
            <MessageCircle size={15} />
            Chat with {bot.name}
          </button>
          <button
            role="menuitem"
            aria-haspopup="menu"
            onClick={() => setView("add")}
          >
            <LayoutGrid size={15} />
            Add to board
            <ChevronRight size={14} className="menu-trailing" />
          </button>
          {on.length > 0 && (
            <button
              role="menuitem"
              aria-haspopup="menu"
              onClick={() => setView("remove")}
            >
              <LogOut size={15} />
              Remove from board
              <ChevronRight size={14} className="menu-trailing" />
            </button>
          )}
          <button role="menuitem" onClick={onNewBoard}>
            <Plus size={15} />
            New board with {bot.name}
          </button>
          <div className="menu-divider" />
          <button role="menuitem" onClick={onMemory}>
            <BookOpen size={15} />
            Open memory
          </button>
          <button
            role="menuitem"
            onClick={() =>
              void run("grants", { botId: bot.id, memory: !memory })
            }
          >
            {memory ? <ShieldOff size={15} /> : <ShieldCheck size={15} />}
            {memory ? "Turn off memory access" : "Turn on memory access"}
          </button>
        </>
      )}
      {view === "add" && (
        <>
          <div className="menu-label">Add {bot.name} to</div>
          {off.length === 0 && (
            <p className="menu-note">
              {open.length
                ? `${bot.name} is on every board.`
                : "No boards yet."}
            </p>
          )}
          {off.map((b) => (
            <button
              key={b.id}
              role="menuitem"
              onClick={() =>
                void run("boards/members", {
                  boardId: b.id,
                  botId: bot.id,
                  role: "",
                })
              }
            >
              <LayoutGrid size={15} />
              {b.name}
            </button>
          ))}
          <div className="menu-divider" />
          <button role="menuitem" onClick={onNewBoard}>
            <Plus size={15} />
            New board with {bot.name}
          </button>
        </>
      )}
      {view === "remove" && (
        <>
          <div className="menu-label">Remove {bot.name} from</div>
          {on.map((b) => {
            const coordinator = b.coordinatorId === bot.id;
            return (
              <button
                key={b.id}
                role="menuitem"
                disabled={coordinator}
                title={
                  coordinator
                    ? "Choose another coordinator on this board first"
                    : undefined
                }
                onClick={() =>
                  void run(
                    "boards/members",
                    { boardId: b.id, botId: bot.id },
                    "DELETE",
                  )
                }
              >
                {coordinator ? <Crown size={15} /> : <LayoutGrid size={15} />}
                {b.name}
                {coordinator && <em className="menu-trailing">coordinator</em>}
              </button>
            );
          })}
        </>
      )}
      <ErrorNote error={error} />
    </div>
  );
}
