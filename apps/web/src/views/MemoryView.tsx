import { useEffect, useState, type FormEvent } from "react";
import { BookOpen, Plus, Search, Trash2, X } from "lucide-react";
import type { BotInstance } from "@socius/contracts";
import type { Memory } from "@socius/contracts/app";
import { DreamSources } from "../components/DreamSources.js";
import { api } from "../api.js";
import {
  Avatar,
  ErrorNote,
  MAIN_BOT_TEMPLATE,
  useDialogMotion,
} from "../components/chrome.js";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/** Memory floats over the workspace, the same way Settings does. */
export function MemoryView({
  botId,
  bots,
  onSelect,
  onClose,
}: {
  botId: string;
  bots: BotInstance[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const bot = bots.find((b) => b.id === botId) ?? bots[0];
  const motion = useDialogMotion(onClose);
  const [records, setRecords] = useState<Memory[]>([]),
    [query, setQuery] = useState(""),
    [editing, setEditing] = useState<Memory | "new" | null>(null),
    [content, setContent] = useState(""),
    [error, setError] = useState("");
  async function load(id: string, q: string) {
    try {
      setRecords(
        await api<Memory[]>(`memory?botId=${id}&q=${encodeURIComponent(q)}`),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (!bot) return;
    void load(bot.id, query);
  }, [bot?.id, query]);
  function openEditor(next: Memory | "new", value = "") {
    setEditing(next);
    setContent(value);
    setError("");
  }
  function closeEditor() {
    setEditing(null);
    setError("");
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!bot) return;
    try {
      await api("memory", {
        botId: bot.id,
        content,
        ...(editing !== "new" && editing ? { id: editing.id } : {}),
      });
      closeEditor();
      await load(bot.id, query);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  if (!bot) return null;
  return (
    <Dialog modal={false} open={motion.open} onOpenChange={motion.onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="dialog-surface settings-dialog memory-dialog"
        aria-labelledby="memory-title"
        onAnimationEnd={motion.onAnimationEnd}
        onInteractOutside={motion.onInteractOutside}
        onEscapeKeyDown={(e) => {
          if (editing) {
            e.preventDefault();
            closeEditor();
          }
        }}
      >
      <nav className="settings-nav" aria-label="Memory bots">
        <DialogTitle id="memory-title">Memory</DialogTitle>
        <div role="tablist" aria-orientation="vertical">
          {bots.map((b) => (
            <button
              key={b.id}
              role="tab"
              id={`memory-tab-${b.id}`}
              aria-selected={bot.id === b.id}
              aria-controls="memory-panel"
              className={bot.id === b.id ? "selected" : ""}
              onClick={() => {
                closeEditor();
                setQuery("");
                onSelect(b.id);
              }}
            >
              <Avatar
                name={b.name}
                main={b.template.id === MAIN_BOT_TEMPLATE}
                size={18}
              />
              <span>{b.name}</span>
            </button>
          ))}
        </div>
      </nav>
      <section
        className="settings-pane"
        id="memory-panel"
        role="tabpanel"
        aria-labelledby={`memory-tab-${bot.id}`}
      >
        <button
          className="icon ghost dialog-close"
          aria-label="Close memory"
          onClick={motion.requestClose}
        >
          <X size={18} />
        </button>
        {editing ? (
          <form className="form memory-editor" onSubmit={save}>
            <header className="pane-head">
              <h3>{editing === "new" ? "Add memory" : "Edit memory"}</h3>
              <p>Private to {bot.name}. Saved only for this bot.</p>
            </header>
            <label>
              What should {bot.name} remember?
              <textarea
                autoFocus
                rows={6}
                required
                maxLength={5000}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </label>
            <ErrorNote error={error} />
            <div className="modal-actions">
              {editing !== "new" && (
                <button
                  type="button"
                  className="danger"
                  onClick={() =>
                    void api(
                      "memory",
                      { botId: bot.id, id: editing.id },
                      "DELETE",
                    )
                      .then(() => {
                        closeEditor();
                        void load(bot.id, query);
                      })
                      .catch((err) => setError((err as Error).message))
                  }
                >
                  <Trash2 size={15} />
                  Delete memory
                </button>
              )}
              <button type="button" onClick={closeEditor}>
                Cancel
              </button>
              <button className="primary">Save memory</button>
            </div>
          </form>
        ) : (
          <>
            <header className="pane-head">
              <h3>{bot.name}</h3>
              <p>Private to this bot. Read it, correct it, or forget it.</p>
            </header>
            <div className="market-toolbar">
              <label className="search">
                <Search size={17} />
                <input
                  aria-label="Search memory"
                  placeholder="Search memories…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <button className="primary" onClick={() => openEditor("new")}>
                <Plus size={16} />
                Add memory
              </button>
            </div>
            <ErrorNote error={error} />
            <div className="memory-list">
              {records.map((m) => (
                <article key={m.id} className="memory-card">
                  <BookOpen size={18} />
                  <div>
                    <p>{m.content}</p>
                    <small>
                      {m.source} · {new Date(m.updatedAt).toLocaleDateString()}
                    </small>
                    {m.dream && <DreamSources botId={bot.id} memoryId={m.id} />}
                  </div>
                  <button
                    className="text-button"
                    onClick={() => openEditor(m, m.content)}
                  >
                    Edit
                  </button>
                </article>
              ))}
            </div>
            {records.length === 0 && (
              <div className="empty">
                <BookOpen size={32} />
                <h2>{query ? "No matching memories" : "A fresh start"}</h2>
                <p>
                  Add a preference or useful context for {bot.name}.
                  <br />
                  Enable Dreaming in Settings to remember useful facts automatically.
                </p>
              </div>
            )}
          </>
        )}
      </section>
      </DialogContent>
    </Dialog>
  );
}
