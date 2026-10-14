import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import type { BotInstance } from "@socius/contracts";
import type { Board } from "@socius/contracts/app";
import { api } from "../api.js";
import { Modal, ErrorNote } from "../components/ui.js";

export function CreateBot({
  board,
  onClose,
  onCreated,
}: {
  /** When set, the new bot joins this board; otherwise it starts unassigned. */
  board?: Board | undefined;
  onClose: () => void;
  onCreated: (bot: BotInstance) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      const bot = await api<BotInstance>("bots", {
        name: data.get("name"),
        role: data.get("role"),
        instructions: data.get("instructions"),
      });
      if (board)
        await api("boards/members", {
          boardId: board.id,
          botId: bot.id,
          role: data.get("boardRole") ?? "",
        });
      onCreated(bot);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={board ? `New bot for ${board.name}` : "Meet your next bot"}
      onClose={onClose}
    >
      <p className="muted">
        Give it one clear job. It starts with its own memory and no permissions
        {board
          ? `, and joins ${board.name} right away.`
          : ". Until you add it to a board it appears under Unassigned."}
      </p>
      <form onSubmit={submit} className="form">
        <label>
          Name
          <input
            name="name"
            placeholder="e.g. College assistant"
            required
            maxLength={100}
            autoFocus
          />
        </label>
        <label>
          Role
          <input
            name="role"
            placeholder="What is its area of responsibility?"
            required
            maxLength={200}
          />
        </label>
        <label>
          Instructions
          <textarea
            name="instructions"
            placeholder="Describe how it should work, what it should return, and when it should ask you."
            required
            maxLength={20000}
            rows={5}
          />
        </label>
        {board && (
          <label>
            Role on {board.name}
            <input
              name="boardRole"
              placeholder="Optional. What it does for this board; teammates see this."
              maxLength={200}
            />
          </label>
        )}
        <ErrorNote error={error} />
        <button className="primary" disabled={busy}>
          {busy ? "Creating…" : "Create bot"}
          <Plus size={16} />
        </button>
      </form>
    </Modal>
  );
}
