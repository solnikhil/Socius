import { useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Bell,
  BellOff,
  Copy,
  Eye,
  EyeOff,
  Folder,
  FolderMinus,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import type { BotInstance } from "@socius/contracts";
import type { BotLayout, Category } from "@socius/contracts/app";
import { api } from "../api.js";
import { ErrorNote, Modal } from "./chrome.js";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";

/** Right-click menu for a bot in the sidebar. */
export function BotMenu({
  bot,
  main,
  layout,
  categories,
  onRefresh,
  children,
}: {
  bot: BotInstance;
  /** The featured coordinator. It cannot join a category or be deleted. */
  main: boolean;
  layout?: BotLayout | undefined;
  categories: Category[];
  onRefresh: () => Promise<void>;
  children: ReactNode;
}) {
  const [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [renaming, setRenaming] = useState(false),
    [name, setName] = useState(bot.name),
    [confirmDelete, setConfirmDelete] = useState(false);
  const dismissRef = useRef<(() => void) | null>(null);
  const pinned = !!layout?.pinned,
    hidden = !!layout?.hidden,
    unread = !!layout?.unread;
  const current = categories.find((f) => f.botIds.includes(bot.id));
  const destinations = categories.filter((f) => f.id !== current?.id);
  async function run(path: string, body: unknown, method?: string) {
    setError("");
    try {
      await api(path, body, method);
      await onRefresh();
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function saveName(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("bots/update", { id: bot.id, name });
      await onRefresh();
      (dismissRef.current ?? (() => setRenaming(false)))();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  async function copyId() {
    setError("");
    try {
      await navigator.clipboard.writeText(bot.id);
      setOpen(false);
    } catch {
      setError("Could not copy the conversation ID.");
    }
  }
  return (
    <>
      <ContextMenu
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setConfirmDelete(false);
            setError("");
          }
        }}
      >
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="context-menu menu-panel">
          <ContextMenuItem
            onSelect={(e) => {
              e.preventDefault();
              void run("bots/layout", { botId: bot.id, pinned: !pinned });
            }}
          >
            {pinned ? <PinOff size={15} /> : <Pin size={15} />}
            {pinned ? "Unpin" : "Pin"}
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Folder size={15} />
              Move to
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="menu-panel menu-flyout">
              {main && (
                <small className="menu-note">Socius stays above the lists.</small>
              )}
              {!main &&
                destinations.map((f) => (
                  <ContextMenuItem
                    key={f.id}
                    onSelect={(e) => {
                      e.preventDefault();
                      void run("categories/move", {
                        botId: bot.id,
                        categoryId: f.id,
                      });
                    }}
                  >
                    <Folder size={15} />
                    {f.name}
                  </ContextMenuItem>
                ))}
              {!main && current && (
                <ContextMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    void run("categories/move", {
                      botId: bot.id,
                      categoryId: null,
                    });
                  }}
                >
                  <FolderMinus size={15} />
                  Unassigned
                </ContextMenuItem>
              )}
              {!main && !destinations.length && !current && (
                <small className="menu-note">No categories yet.</small>
              )}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem
            onSelect={(e) => {
              e.preventDefault();
              void run("bots/layout", { botId: bot.id, unread: !unread });
            }}
          >
            {unread ? <BellOff size={15} /> : <Bell size={15} />}
            {unread ? "Mark as read" : "Mark as unread"}
          </ContextMenuItem>
          <ContextMenuSeparator className="menu-divider" />
          <ContextMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setName(bot.name);
              setOpen(false);
              setRenaming(true);
            }}
          >
            <Pencil size={15} />
            Rename bot
          </ContextMenuItem>
          <ContextMenuSeparator className="menu-divider" />
          <ContextMenuItem
            onSelect={(e) => {
              e.preventDefault();
              void copyId();
            }}
          >
            <Copy size={15} />
            Copy conversation ID
          </ContextMenuItem>
          <ContextMenuSeparator className="menu-divider" />
          <ContextMenuItem
            onSelect={(e) => {
              e.preventDefault();
              void run("bots/layout", { botId: bot.id, hidden: !hidden });
            }}
          >
            {hidden ? <Eye size={15} /> : <EyeOff size={15} />}
            {hidden ? "Show in sidebar" : "Hide from sidebar"}
          </ContextMenuItem>
          {!main && (
            <ContextMenuItem
              variant="destructive"
              onSelect={(e) => {
                e.preventDefault();
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                void run("bots", { id: bot.id }, "DELETE");
              }}
            >
              <Trash2 size={15} />
              {confirmDelete ? "Delete for good?" : "Delete"}
            </ContextMenuItem>
          )}
          <ErrorNote error={error} />
        </ContextMenuContent>
      </ContextMenu>
      {renaming && (
        <Modal
          title="Rename bot"
          dismissRef={dismissRef}
          onClose={() => setRenaming(false)}
        >
          <form className="form" onSubmit={(e) => void saveName(e)}>
            <label>
              Name
              <input
                autoFocus
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <ErrorNote error={error} />
            <div className="modal-actions">
              <button
                type="button"
                onClick={() =>
                  (dismissRef.current ?? (() => setRenaming(false)))()
                }
              >
                Cancel
              </button>
              <button className="primary">Save</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
