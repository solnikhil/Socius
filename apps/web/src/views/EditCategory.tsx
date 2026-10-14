import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import type { BotInstance } from "@socius/contracts";
import type { Category } from "@socius/contracts/app";
import { api } from "../api.js";
import { Avatar, ErrorNote, Modal } from "../components/ui.js";

/** Creates a sidebar category, or edits one when `category` is given. */
export function EditCategory({
  specialists,
  categories,
  category,
  onClose,
  onSaved,
}: {
  specialists: BotInstance[];
  categories: Category[];
  category?: Category;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(category?.botIds ?? []),
    [name, setName] = useState(category?.name ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const elsewhere = (id: string) =>
    categories.find((f) => f.id !== category?.id && f.botIds.includes(id));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        category ? "categories/update" : "categories",
        category
          ? { id: category.id, name, botIds: picked }
          : { name, botIds: picked },
      );
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={category ? "Edit category" : "New category"}
      className="group-dialog"
      onClose={onClose}
    >
      <p className="muted">
        Categories only organise the sidebar. Bots in a category don’t share
        anything; start a group chat to have them work together.
      </p>
      <form className="form" onSubmit={submit}>
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Work, Home, College…"
            maxLength={100}
            required
            autoFocus
          />
        </label>
        {specialists.length > 0 && (
          <div className="member-list" role="group" aria-label="Bots">
            {specialists.map((b) => {
              const on = picked.includes(b.id);
              const from = elsewhere(b.id);
              return (
                <button
                  type="button"
                  key={b.id}
                  role="checkbox"
                  aria-checked={on}
                  className="member-row"
                  onClick={() => toggle(b.id)}
                >
                  <Avatar name={b.name} size={32} />
                  <span className="bot-text">
                    <strong>{b.name}</strong>
                    <small>
                      {on && from ? `Moves from ${from.name}` : b.role}
                    </small>
                  </span>
                  <span
                    className={`member-check ${on ? "checked" : ""}`}
                    aria-hidden="true"
                  >
                    {on && <Check size={13} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <ErrorNote error={error} />
        <button className="primary" disabled={busy || !name.trim()}>
          {busy ? "Saving…" : category ? "Save changes" : "Create category"}
        </button>
      </form>
    </Modal>
  );
}
