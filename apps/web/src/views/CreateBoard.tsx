import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import type { BotInstance } from "@socius/contracts";
import type { Board } from "@socius/contracts/app";
import { api } from "../api.js";
import { Avatar, ErrorNote, Modal } from "../components/ui.js";

export function CreateBoard({
  bots,
  mainId,
  onClose,
  onCreated,
}: {
  bots: BotInstance[];
  mainId: string;
  onClose: () => void;
  onCreated: (board: Board) => void;
}) {
  const [members, setMembers] = useState<string[]>([mainId]),
    [coordinator, setCoordinator] = useState(mainId),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  function toggle(id: string) {
    setMembers((m) => {
      const next = m.includes(id) ? m.filter((x) => x !== id) : [...m, id];
      if (!next.includes(coordinator) && next[0]) setCoordinator(next[0]);
      return next;
    });
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      const board = await api<Board>("boards", {
        name: data.get("name"),
        objective: data.get("objective"),
        completionCriteria: data.get("criteria"),
        memberIds: members,
        coordinatorId: coordinator,
      });
      onCreated(board);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Start a board" onClose={onClose}>
      <p className="muted">
        A board is a shared workspace for your bots. Add as many as the work
        needs; each keeps its own memory and permissions.
      </p>
      <form onSubmit={submit} className="form">
        <label>
          Name
          <input
            name="name"
            placeholder="e.g. Market research"
            required
            maxLength={100}
            autoFocus
          />
        </label>
        <label>
          Objective
          <textarea
            name="objective"
            placeholder="What should this team achieve?"
            required
            maxLength={2000}
            rows={2}
          />
        </label>
        <label>
          Completion criteria
          <textarea
            name="criteria"
            placeholder="Optional. How will you know the result is good enough?"
            maxLength={2000}
            rows={2}
          />
        </label>
        <fieldset className="member-picker">
          <legend>Members · {members.length} selected</legend>
          {bots.map((b) => (
            <label key={b.id} className="member-option">
              <input
                type="checkbox"
                checked={members.includes(b.id)}
                onChange={() => toggle(b.id)}
              />
              <Avatar name={b.name} main={b.id === mainId} size={26} />
              <span>
                <strong>{b.name}</strong>
                <small>{b.role}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <label>
          Coordinator
          <select
            value={coordinator}
            onChange={(e) => setCoordinator(e.target.value)}
          >
            {bots
              .filter((b) => members.includes(b.id))
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
        </label>
        <ErrorNote error={error} />
        <button className="primary" disabled={busy || !members.length}>
          {busy ? "Creating…" : "Create board"}
          <Plus size={16} />
        </button>
      </form>
    </Modal>
  );
}
