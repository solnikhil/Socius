import { useCallback, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Category } from "@socius/contracts/app";
import { api } from "../api.js";
import { ErrorNote, useDismiss } from "./ui.js";
import { useMenuPlacement } from "./menu.js";

/** Right-click menu for a sidebar category. */
export function CategoryMenu({
  category,
  x,
  y,
  onClose,
  onEdit,
  onRefresh,
}: {
  category: Category;
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
      await api("categories", { id: category.id }, "DELETE");
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
      aria-label={`${category.name} options`}
      style={position}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button role="menuitem" autoFocus onClick={onEdit}>
        <Pencil size={15} />
        Edit category
      </button>
      <button role="menuitem" onClick={() => void remove()}>
        <Trash2 size={15} />
        Delete category
      </button>
      <small className="menu-note">Its bots move back to Bots.</small>
      <ErrorNote error={error} />
    </div>
  );
}
