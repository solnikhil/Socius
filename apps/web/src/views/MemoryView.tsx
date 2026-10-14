import { useEffect, useState, type FormEvent } from "react";
import { BookOpen, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import type { BotInstance } from "@socius/contracts";
import type { Memory } from "@socius/contracts/app";
import { api } from "../api.js";
import { Modal, ErrorNote } from "../components/ui.js";

export function MemoryView({
  bot,
  bots,
  onSelect,
}: {
  bot: BotInstance;
  bots: BotInstance[];
  onSelect: (id: string) => void;
}) {
  const [records, setRecords] = useState<Memory[]>([]),
    [query, setQuery] = useState(""),
    [editing, setEditing] = useState<Memory | "new" | null>(null),
    [content, setContent] = useState(""),
    [error, setError] = useState("");
  async function load() {
    try {
      setRecords(
        await api<Memory[]>(
          `memory?botId=${bot.id}&q=${encodeURIComponent(query)}`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [bot.id, query]);
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api("memory", {
        botId: bot.id,
        content,
        ...(editing !== "new" && editing ? { id: editing.id } : {}),
      });
      setEditing(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="page">
      <div className="section-head">
        <div>
          <span className="eyebrow">A LITTLE CONTEXT GOES A LONG WAY</span>
          <h1>Memory you can make sense of.</h1>
          <p className="subtitle">
            Private to each bot. Read it, correct it, or forget it.
          </p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setEditing("new");
            setContent("");
          }}
        >
          <Plus size={16} />
          Add memory
        </button>
      </div>
      <div className="market-toolbar">
        <label className="scope">
          Bot
          <select
            aria-label="Memory bot"
            value={bot.id}
            onChange={(e) => onSelect(e.target.value)}
          >
            {bots.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Search memory"
            placeholder="Search memories…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
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
            </div>
            <button
              className="text-button"
              onClick={() => {
                setEditing(m);
                setContent(m.content);
              }}
            >
              Edit
            </button>
            <button
              className="icon"
              aria-label="Delete memory"
              onClick={() => {
                setEditing(m);
                setContent(m.content);
              }}
            >
              <MoreHorizontal size={18} />
            </button>
          </article>
        ))}
      </div>
      {records.length === 0 && (
        <div className="empty">
          <BookOpen size={32} />
          <h2>{query ? "No matching memories" : "A fresh start"}</h2>
          <p>
            Add a preference or useful context for {bot.name}.<br />
            The bot can also propose memories for your approval.
          </p>
        </div>
      )}
      {editing && (
        <Modal
          title={editing === "new" ? "Add memory" : "Edit memory"}
          onClose={() => setEditing(null)}
        >
          <form className="form" onSubmit={save}>
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
                        setEditing(null);
                        void load();
                      })
                      .catch((e) => setError(e.message))
                  }
                >
                  <Trash2 size={15} />
                  Delete memory
                </button>
              )}
              <button className="primary">Save memory</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
