import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Bell,
  BellOff,
  ChevronRight,
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
import { ErrorNote, Modal, useDismiss } from "./ui.js";
import { useMenuPlacement } from "./menu.js";

/** Right-click menu for a bot in the sidebar. */
export function BotMenu({
  bot,
  main,
  layout,
  categories,
  x,
  y,
  onClose,
  onRefresh,
}: {
  bot: BotInstance;
  /** The featured coordinator. It cannot join a category or be deleted. */
  main: boolean;
  layout?: BotLayout | undefined;
  categories: Category[];
  x: number;
  y: number;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [moveOpen, setMoveOpen] = useState(false),
    [renaming, setRenaming] = useState(false),
    [name, setName] = useState(bot.name),
    [confirmDelete, setConfirmDelete] = useState(false),
    [flyout, setFlyout] = useState({ left: 0, top: 0 });
  const close = useCallback(() => onClose(), [onClose]);
  const ref = useDismiss(!renaming, close);
  const menuRef = useRef<HTMLDivElement>(null);
  const moveRef = useRef<HTMLButtonElement>(null);
  const position = useMenuPlacement(menuRef, x, y, moveOpen);
  const pinned = !!layout?.pinned,
    hidden = !!layout?.hidden,
    unread = !!layout?.unread;
  const current = categories.find((f) => f.botIds.includes(bot.id));
  const destinations = categories.filter((f) => f.id !== current?.id);
  useLayoutEffect(() => {
    const row = moveRef.current?.getBoundingClientRect();
    if (!row || !moveOpen) return;
    const width = 210;
    const left =
      row.right + 8 + width > innerWidth ? row.left - width - 8 : row.right + 8;
    setFlyout({
      left: Math.max(8, left),
      top: Math.max(8, Math.min(row.top, innerHeight - 240)),
    });
  }, [moveOpen, position]);
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
  async function saveName(e: FormEvent) {
    e.preventDefault();
    await run("bots/update", { id: bot.id, name });
  }
  async function copyId() {
    setError("");
    try {
      await navigator.clipboard.writeText(bot.id);
      onClose();
    } catch {
      setError("Could not copy the conversation ID.");
    }
  }
  return (
    <div ref={ref}>
      {!renaming && (
        <div
          ref={menuRef}
          className="popover context-menu"
          role="menu"
          aria-label={`${bot.name} options`}
          style={position}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            role="menuitem"
            autoFocus
            onClick={() =>
              void run("bots/layout", { botId: bot.id, pinned: !pinned })
            }
          >
            {pinned ? <PinOff size={15} /> : <Pin size={15} />}
            {pinned ? "Unpin" : "Pin"}
          </button>
          <div className="menu-sub">
            <button
              ref={moveRef}
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={moveOpen}
              onClick={() => setMoveOpen(true)}
              onMouseEnter={() => setMoveOpen(true)}
            >
              <Folder size={15} />
              Move to
              <ChevronRight size={14} className="menu-trailing" />
            </button>
            {moveOpen && (
              <div
                className="popover context-menu menu-flyout"
                role="menu"
                aria-label="Move to"
                style={flyout}
              >
                {main && (
                  <small className="menu-note">
                    Socius stays above the lists.
                  </small>
                )}
                {!main &&
                  destinations.map((f) => (
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
                {!main && current && (
                  <button
                    role="menuitem"
                    onClick={() =>
                      void run("categories/move", {
                        botId: bot.id,
                        categoryId: null,
                      })
                    }
                  >
                    <FolderMinus size={15} />
                    Unassigned
                  </button>
                )}
                {!main && !destinations.length && !current && (
                  <small className="menu-note">No categories yet.</small>
                )}
              </div>
            )}
          </div>
          <button
            role="menuitem"
            onClick={() =>
              void run("bots/layout", { botId: bot.id, unread: !unread })
            }
          >
            {unread ? <BellOff size={15} /> : <Bell size={15} />}
            {unread ? "Mark as read" : "Mark as unread"}
          </button>
          <div className="menu-divider" />
          <button role="menuitem" onClick={() => setRenaming(true)}>
            <Pencil size={15} />
            Rename bot
          </button>
          <div className="menu-divider" />
          <button role="menuitem" onClick={() => void copyId()}>
            <Copy size={15} />
            Copy conversation ID
          </button>
          <div className="menu-divider" />
          <button
            role="menuitem"
            onClick={() =>
              void run("bots/layout", { botId: bot.id, hidden: !hidden })
            }
          >
            {hidden ? <Eye size={15} /> : <EyeOff size={15} />}
            {hidden ? "Show in sidebar" : "Hide from sidebar"}
          </button>
          {!main && (
            <button
              role="menuitem"
              className="danger"
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                void run("bots", { id: bot.id }, "DELETE");
              }}
            >
              <Trash2 size={15} />
              {confirmDelete ? "Delete for good?" : "Delete"}
            </button>
          )}
          <ErrorNote error={error} />
        </div>
      )}
      {renaming && (
        <Modal title="Rename bot" onClose={() => setRenaming(false)}>
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
              <button type="button" onClick={() => setRenaming(false)}>
                Cancel
              </button>
              <button className="primary">Save</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
