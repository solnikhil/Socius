import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import type {
  BotAppearance,
  BotInstance,
  BotManifest,
} from "@socius/contracts";
import { api } from "../api.js";
import { Modal, ErrorNote } from "../components/chrome.js";
import { AvatarPicker, appearanceOf } from "../components/avatar.js";

export function CreateBot({
  templates,
  onClose,
  onCreated,
}: {
  /** Catalog bot templates; picking one fills the form, which stays editable. */
  templates: BotManifest[];
  onClose: () => void;
  onCreated: (bot: BotInstance) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [picked, setPicked] = useState(""),
    [category, setCategory] = useState("Featured"),
    [form, setForm] = useState({ name: "", role: "", instructions: "" }),
    // Until the user picks, the preview follows the name like older bots did.
    [chosen, setChosen] = useState<BotAppearance>();
  const look = appearanceOf(form.name.trim() || "New bot", chosen);
  // Featured first, then the rest alphabetically, whatever order the catalog uses.
  const categories = [
    ...new Set(templates.map((t) => t.category ?? "Other")),
  ].sort((a, b) =>
    a === "Featured" ? -1 : b === "Featured" ? 1 : a.localeCompare(b),
  );
  const shown = templates.filter((t) => (t.category ?? "Other") === category);
  const use = (t: BotManifest) => {
    setPicked(t.id);
    setForm({ name: t.name, role: t.role, instructions: t.instructions });
  };
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const bot = await api<BotInstance>("bots", {
        ...form,
        appearance: look,
      });
      onCreated(bot);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const field =
    (key: keyof typeof form) => (e: { target: { value: string } }) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <Modal title="Meet your next bot" className="create-bot" onClose={onClose}>
      <p className="muted">
        Give it one clear job, or start from a template and edit it. It starts
        with its own memory and no permissions.
      </p>
      {templates.length > 0 && (
        <div className="templates" role="group" aria-label="Templates">
          <div className="template-tabs" role="tablist">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={c === category}
                className={c === category ? "selected" : ""}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="template-list">
            {shown.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={t.id === picked}
                className={`template-card ${t.id === picked ? "selected" : ""}`}
                title={t.description}
                onClick={() => use(t)}
              >
                <strong>{t.name}</strong>
                <small>{t.role}</small>
              </button>
            ))}
          </div>
        </div>
      )}
      <form onSubmit={submit} className="form">
        <label>
          Name
          <input
            value={form.name}
            onChange={field("name")}
            placeholder="e.g. College assistant"
            required
            maxLength={100}
            autoFocus
          />
        </label>
        <div className="form-field" role="group" aria-label="Look">
          <span>Look</span>
          <AvatarPicker
            name={form.name.trim() || "New bot"}
            value={look}
            onChange={setChosen}
          />
        </div>
        <label>
          Role
          <input
            value={form.role}
            onChange={field("role")}
            placeholder="What is its area of responsibility?"
            required
            maxLength={200}
          />
        </label>
        <label>
          Instructions
          <textarea
            aria-label="Instructions"
            value={form.instructions}
            onChange={field("instructions")}
            placeholder="Describe how it should work, what it should return, and when it should ask you."
            required
            maxLength={20000}
            rows={5}
          />
        </label>
        <ErrorNote error={error} />
        <button className="primary" disabled={busy}>
          {busy ? "Creating…" : "Create bot"}
          <Plus size={16} />
        </button>
      </form>
    </Modal>
  );
}
