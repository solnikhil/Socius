import { useCallback, useState } from "react";
import {
  BookOpen,
  Folder,
  FolderMinus,
  MessageCircle,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import type { BotInstance } from "@socius/contracts";
import type { Category } from "@socius/contracts/app";
import { api } from "../api.js";
import { ErrorNote, useDismiss } from "./ui.js";
import { useMenuPlacement } from "./menu.js";

/** Right-click menu for a bot in the sidebar. */
export function BotMenu({
  bot,
  x,
  y,
  onClose,
  onChat,
  onMemory,
  onRefresh,
  categories,
}: {
  bot: BotInstance;
  x: number;
  y: number;
  onClose: () => void;
  onChat: () => void;
  onMemory: () => void;
  onRefresh: () => Promise<void>;
  /** Categories the bot can move to; omitted for the main bot. */
  categories?: Category[];
}) {
  const [error, setError] = useState("");
  const close = useCallback(() => onClose(), [onClose]);
  const ref = useDismiss(true, close);
  const position = useMenuPlacement(ref, x, y, null);
  const memory = bot.grantedCapabilities.includes("memory.read");
  const current = categories?.find((f) => f.botIds.includes(bot.id));
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
      className="popover context-menu"
      role="menu"
      aria-label={`${bot.name} options`}
      style={position}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button role="menuitem" autoFocus onClick={onChat}>
        <MessageCircle size={15} />
        Chat with {bot.name}
      </button>
      <button role="menuitem" onClick={onMemory}>
        <BookOpen size={15} />
        Open memory
      </button>
      <button
        role="menuitem"
        onClick={() => void run("grants", { botId: bot.id, memory: !memory })}
      >
        {memory ? <ShieldOff size={15} /> : <ShieldCheck size={15} />}
        {memory ? "Turn off memory access" : "Turn on memory access"}
      </button>
      {categories && (categories.length > 0 || current) && (
        <>
          <div className="menu-divider" />
          <div className="menu-label">Move to category</div>
          {categories
            .filter((f) => f.id !== current?.id)
            .map((f) => (
              <button
                key={f.id}
                role="menuitem"
                onClick={() =>
                  void run("categories/move", {
                    botId: bot.id,
                    categoryId: f.id,
                  })
                }
              >
                <Folder size={15} />
                {f.name}
              </button>
            ))}
          {current && (
            <button
              role="menuitem"
              onClick={() =>
                void run("categories/move", { botId: bot.id, categoryId: null })
              }
            >
              <FolderMinus size={15} />
              Remove from {current.name}
            </button>
          )}
        </>
      )}
      <ErrorNote error={error} />
    </div>
  );
}
