import { useState, type ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Category } from "@socius/contracts/app";
import { api } from "../api.js";
import { ErrorNote } from "./chrome.js";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

/** Right-click menu for a sidebar category. */
export function CategoryMenu({
  category,
  onEdit,
  onRefresh,
  children,
}: {
  category: Category;
  onEdit: () => void;
  onRefresh: () => Promise<void>;
  children: ReactNode;
}) {
  const [error, setError] = useState(""),
    [open, setOpen] = useState(false);
  async function remove() {
    setError("");
    try {
      await api("categories", { id: category.id }, "DELETE");
      await onRefresh();
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <ContextMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError("");
      }}
    >
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent
        className="context-menu menu-panel"
        aria-label={`${category.name} options`}
      >
        <ContextMenuItem
          onSelect={() => {
            onEdit();
          }}
        >
          <Pencil size={15} />
          Edit category
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void remove();
          }}
        >
          <Trash2 size={15} />
          Delete category
        </ContextMenuItem>
        <small className="menu-note">Its bots move back to Bots.</small>
        <ErrorNote error={error} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
