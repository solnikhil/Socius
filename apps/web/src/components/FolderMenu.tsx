import { useCallback, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { BotFolder } from "@socius/contracts/app";
import { api } from "../api.js";
import { ErrorNote, useDismiss } from "./ui.js";
import { useMenuPlacement } from "./menu.js";

/** Right-click menu for a sidebar folder. */
export function FolderMenu({
  folder,
  x,
  y,
  onClose,
  onEdit,
  onRefresh,
}: {
  folder: BotFolder;
  x: number;
  y: number;
  onClose: () => void;
  onEdit: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const close = useCallback(() => onClose(), [onClose]);
  const ref = useDismiss(true, close);
  const position = useMenuPlacement(ref, x, y, null);
  async function remove() {
    setError("");
    try {
      await api("folders", { id: folder.id }, "DELETE");
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
      aria-label={`${folder.name} options`}
      style={position}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button role="menuitem" autoFocus onClick={onEdit}>
        <Pencil size={15} />
        Edit folder
      </button>
      <button role="menuitem" onClick={() => void remove()}>
        <Trash2 size={15} />
        Delete folder
      </button>
      <small className="menu-note">Its bots move back to Bots.</small>
      <ErrorNote error={error} />
    </div>
  );
}
