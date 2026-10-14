import { useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp } from "lucide-react";
import type { BotAppearance } from "@socius/contracts";
import type {
  Approval,
  BotDraft,
  DelegatedAsk,
  BotUpdate,
  GroupDraft,
  GroupMembersChange,
  Snapshot,
} from "@socius/contracts/app";
import { api } from "../api.js";
import { ErrorNote, Markdown } from "./chrome.js";
import { AvatarPicker, appearanceOf } from "./avatar.js";

/**
 * A change Socius proposes to the workspace (or a memory save), asked as a
 * question with lettered answers. Approval covers exactly what is shown; a
 * typed answer declines and goes back to the bot so it can adjust.
 */
export function ApprovalCard({
  approval: a,
  state,
  onRefresh,
}: {
  approval: Approval;
  state: Snapshot;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reply, setReply] = useState(""),
    [look, setLook] = useState<BotAppearance>();
  const name = (id: string) =>
    state.bots.find((b) => b.id === id)?.name ?? "a removed bot";
  const proposer = name(a.botId);
  const draft = a.kind === "bot" ? (a.payload as BotDraft) : undefined;
  async function resolve(approve: boolean, feedback?: string) {
    setBusy(true);
    setError("");
    try {
      await api("approvals", {
        id: a.id,
        digest: a.digest,
        approve,
        ...(feedback ? { feedback } : {}),
        ...(approve && draft
          ? { appearance: appearanceOf(draft.name, look) }
          : {}),
      });
      setReply("");
      await onRefresh();
      // Answered: hand the keyboard back to the message box.
      document
        .querySelector<HTMLTextAreaElement>(".composer textarea")
        ?.focus({ preventScroll: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function answer(e: FormEvent) {
    e.preventDefault();
    if (reply.trim()) void resolve(false, reply.trim());
  }
  // Letter keys answer only once the user has focused the card themselves.
  function keys(e: KeyboardEvent<HTMLDivElement>) {
    if (
      busy ||
      e.target !== e.currentTarget ||
      e.repeat ||
      e.metaKey ||
      e.ctrlKey ||
      e.altKey
    )
      return;
    const key = e.key.toLowerCase();
    if (key === "a") void resolve(true);
    else if (key === "b") void resolve(false);
  }
  const { question, body } = describe(a, name);
  return (
    <div
      className="decision-card approval-card"
      data-approval={a.id}
      tabIndex={0}
      onKeyDown={keys}
      aria-label={`${question} Needs your approval`}
    >
      <div className="decision-head">
        <strong>{question}</strong>
      </div>
      <div className="decision-details">{body}</div>
      {draft && (
        <div className="decision-look">
          <AvatarPicker
            name={draft.name}
            value={appearanceOf(draft.name, look)}
            onChange={setLook}
            compact
          />
        </div>
      )}
      <div className="decision-options" role="group" aria-label="Answer">
        <button
          type="button"
          disabled={busy}
          onClick={() => void resolve(true)}
        >
          <kbd>A</kbd> Yes, go ahead
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void resolve(false)}
        >
          <kbd>B</kbd> No, don't
        </button>
      </div>
      <form className="decision-reply" onSubmit={answer}>
        <input
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Type your own answer"
          aria-label={`Reply to ${proposer} instead`}
          maxLength={2000}
          disabled={busy}
        />
        {reply.trim() && (
          <button className="icon" aria-label="Send answer" disabled={busy}>
            <ArrowUp size={15} />
          </button>
        )}
      </form>
      <ErrorNote error={error} />
      <p className="decision-meta">
        {proposer} is waiting · nothing changes until you approve
      </p>
    </div>
  );
}

/** The question and the details that matter for each kind of proposal. */
function describe(a: Approval, name: (id: string) => string) {
  const field = (label: string, value: string) => (
    <p className="decision-field" key={label}>
      <span>{label}</span> {value}
    </p>
  );
  const prose = (text: string) => (
    <div className="decision-prose" key="prose">
      <Markdown text={text} />
    </div>
  );
  if (a.kind === "memory")
    return {
      question: "Save this to memory?",
      body: prose(a.payload as string),
    };
  if (a.kind === "bot") {
    const d = a.payload as BotDraft;
    return {
      question: `Create a bot called “${d.name}”?`,
      body: [field("Role", d.role), prose(d.instructions)],
    };
  }
  if (a.kind === "bot-update") {
    const u = a.payload as BotUpdate;
    return {
      question: `Update ${name(u.botId)}?`,
      body: [
        u.name && field("New name", u.name),
        u.role && field("New role", u.role),
        u.instructions && [
          field("New instructions", "replace the current ones"),
          prose(u.instructions),
        ],
      ],
    };
  }
  if (a.kind === "ask") {
    const q = a.payload as DelegatedAsk;
    return {
      question: `Let ${name(q.botId)} use ${q.apps.join(", ")} to answer ${name(a.botId)}?`,
      body: [field("Request", ""), prose(q.request)],
    };
  }
  if (a.kind === "group") {
    const g = a.payload as GroupDraft;
    return {
      question: `Create the group chat “${g.name}”?`,
      body: field("Members", g.memberIds.map(name).join(", ")),
    };
  }
  const c = a.payload as GroupMembersChange;
  return {
    question: `${a.content}?`,
    body: field("Members after", c.memberIds.map(name).join(", ")),
  };
}
