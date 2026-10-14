import { useState, type FormEvent } from "react";
import { Check, Plus } from "lucide-react";
import type { BotInstance } from "@socius/contracts";
import type { GroupChat } from "@socius/contracts/app";
import { api } from "../api.js";
import { Avatar, ErrorNote, Modal } from "../components/chrome.js";

/** Creates a group chat, or edits one when `group` is given. */
export function CreateGroup({
  lead,
  specialists,
  group,
  onClose,
  onSaved,
  onCreateBot,
}: {
  lead: BotInstance;
  specialists: BotInstance[];
  group?: GroupChat;
  onClose: () => void;
  onSaved: (group: GroupChat) => void;
  onCreateBot: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(group?.memberIds ?? []),
    [name, setName] = useState(group?.name ?? ""),
    [maxAsks, setMaxAsks] = useState(group?.maxAsks ?? 6),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const saved = await api<GroupChat>(
        group ? "groups/update" : "groups",
        group
          ? {
              id: group.id,
              memberIds: picked,
              maxAsks,
              ...(name.trim() ? { name } : {}),
            }
          : { memberIds: picked, maxAsks, ...(name.trim() ? { name } : {}) },
      );
      onSaved(saved);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={group ? "Edit group chat" : "New group chat"}
      className="group-dialog"
      onClose={onClose}
    >
      <p className="muted">
        {lead.name} leads every group. It knows what each member does and asks
        them for help when their role fits.
      </p>
      {specialists.length === 0 ? (
        <div className="group-empty">
          <p>Create a specialist bot first, then add it to a group.</p>
          <button className="primary" onClick={onCreateBot}>
            Create bot
            <Plus size={16} />
          </button>
        </div>
      ) : (
        <form className="form" onSubmit={submit}>
          <div className="member-list" role="group" aria-label="Members">
            <div className="member-row fixed">
              <Avatar name={lead.name} main size={32} />
              <span className="bot-text">
                <strong>{lead.name}</strong>
                <small>Coordinator</small>
              </span>
              <span className="member-check checked" aria-hidden="true">
                <Check size={13} strokeWidth={3} />
              </span>
            </div>
            {specialists.map((b) => {
              const on = picked.includes(b.id);
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
                    <small>{b.role}</small>
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
          <label>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                picked.length
                  ? specialists
                      .filter((b) => picked.includes(b.id))
                      .map((b) => b.name)
                      .join(", ")
                  : "Optional"
              }
              maxLength={100}
            />
          </label>
          <label>
            Member requests per message
            <input
              type="number"
              min={0}
              max={20}
              value={maxAsks}
              onChange={(e) =>
                setMaxAsks(
                  Math.max(0, Math.min(20, Math.round(+e.target.value || 0))),
                )
              }
            />
            <small>
              How many times {lead.name} may ask members for help on one
              message. 0 means {lead.name} answers alone.
            </small>
          </label>
          <ErrorNote error={error} />
          <button className="primary" disabled={busy || picked.length === 0}>
            {busy
              ? "Saving…"
              : group
                ? "Save changes"
                : picked.length
                  ? `Start group chat`
                  : "Pick at least one member"}
          </button>
        </form>
      )}
    </Modal>
  );
}
