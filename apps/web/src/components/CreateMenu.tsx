import { useCallback, useRef } from "react";
import { Bot, FolderPlus, MessageCirclePlus, Users } from "lucide-react";
import { useDismiss } from "./ui.js";
import { useMenuPlacement } from "./menu.js";

/** The top-bar create menu: start a chat, a group chat, a bot or a folder. */
export function CreateMenu({
  x,
  y,
  onClose,
  onChat,
  onGroup,
  onBot,
  onFolder,
}: {
  x: number;
  y: number;
  onClose: () => void;
  onChat: () => void;
  onGroup: () => void;
  onBot: () => void;
  onFolder: () => void;
}) {
  const close = useCallback(() => onClose(), [onClose]);
  const ref = useDismiss(true, close);
  const position = useMenuPlacement(ref, x, y, null);
  const first = useRef<HTMLButtonElement>(null);
  const pick = (action: () => void) => () => {
    onClose();
    action();
  };
  return (
    <div
      ref={ref}
      className="popover context-menu create-menu"
      role="menu"
      aria-label="Create"
      style={position}
    >
      <button ref={first} role="menuitem" autoFocus onClick={pick(onChat)}>
        <MessageCirclePlus size={15} />
        New chat
        <kbd className="menu-trailing">⌘N</kbd>
      </button>
      <button role="menuitem" onClick={pick(onGroup)}>
        <Users size={15} />
        New group chat
      </button>
      <button role="menuitem" onClick={pick(onBot)}>
        <Bot size={15} />
        New bot
      </button>
      <button role="menuitem" onClick={pick(onFolder)}>
        <FolderPlus size={15} />
        New folder
      </button>
    </div>
  );
}
