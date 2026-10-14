import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileText,
  Pencil,
  Plus,
  Settings,
  Square,
  Trash2,
  X,
} from "lucide-react";
import type { BotInstance } from "@socius/contracts";
import type { GroupChat, Message, Snapshot } from "@socius/contracts/app";
import { api } from "../api.js";
import {
  Avatar,
  ErrorNote,
  GroupAvatar,
  Markdown,
  Modal,
  useDismiss,
} from "../components/ui.js";
import { ApprovalCard } from "../components/ApprovalCard.js";

const suggestions = [
  "Create a research bot that turns my supplied sources into evidence-based briefs.",
  "Help me summarise a document. I’ll attach it here.",
  "Help me make a plan for the work I need to get done today.",
];
const groupSuggestions = [
  "Plan a product launch: research the risks first, then draft the announcement.",
  "Each of you, tell me how you’d help with my week.",
  "Review this idea from every angle and give me one recommendation.",
];

/**
 * One conversation: a direct chat with `bot`, or a group chat that `bot`
 * (the main bot) coordinates. Both look and behave the same.
 */
export function Chat({
  bot,
  main,
  group,
  state,
  onRefresh,
  onSettings,
  onEditGroup,
  onDeleteGroup,
}: {
  bot: BotInstance;
  main: boolean;
  group?: GroupChat;
  state: Snapshot;
  onRefresh: () => Promise<void>;
  onSettings: () => void;
  onEditGroup?: () => void;
  onDeleteGroup?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [text, setText] = useState(""),
    [stream, setStream] = useState<{ botId: string; content: string } | null>(
      null,
    ),
    [confirmDelete, setConfirmDelete] = useState(false),
    [busy, setBusy] = useState(false),
    [taskId, setTaskId] = useState(""),
    [error, setError] = useState(""),
    [attachment, setAttachment] = useState<{
      name: string;
      text: string;
    } | null>(null),
    [consent, setConsent] = useState(false),
    [details, setDetails] = useState(false),
    [copied, setCopied] = useState("");
  const bottom = useRef<HTMLDivElement>(null),
    upload = useRef<HTMLInputElement>(null),
    input = useRef<HTMLTextAreaElement>(null);
  const closeDetails = useCallback(() => {
    setDetails(false);
    setConfirmDelete(false);
  }, []);
  const detailsRef = useDismiss(details, closeDetails);
  const conversation = group?.id ?? bot.id;
  const title = group?.name ?? bot.name;
  const messagesPath = group
    ? `groups/messages?groupId=${group.id}`
    : `messages?botId=${bot.id}`;
  const members = group
    ? group.memberIds
        .map((id) => state.bots.find((b) => b.id === id))
        .filter((b): b is BotInstance => !!b)
    : [];
  const faces = [{ name: bot.name, main: true }, ...members];
  const author = (id: string) => state.bots.find((b) => b.id === id);
  const running = state.tasks.find(
    (t) =>
      t.state === "running" &&
      (group ? t.groupId === group.id : t.botId === bot.id && !t.groupId),
  );
  const memory = bot.grantedCapabilities.includes("memory.read");
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const next = await api<Message[]>(messagesPath);
        if (mounted) setMessages(next);
      } catch (e) {
        if (mounted) setError((e as Error).message);
      }
    }
    if (!busy) void load();
    const timer = setInterval(() => {
      if (!busy) void load();
    }, 2500);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [messagesPath, busy]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, stream]);
  useEffect(() => {
    input.current?.focus();
  }, [conversation]);
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);
  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!text.trim() || busy || running) return;
    setBusy(true);
    setError("");
    setStream(null);
    const content = text;
    setText("");
    try {
      const response = await fetch(group ? "/api/groups/chat" : "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(group ? { groupId: group.id } : { botId: bot.id }),
          content,
          ...(attachment ? { attachment } : {}),
        }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error);
      }
      setAttachment(null);
      setMessages(await api<Message[]>(messagesPath));
      const reader = response.body!.getReader(),
        decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const event = JSON.parse(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          if (event.type === "started") setTaskId(event.taskId);
          if (event.type === "text")
            setStream({ botId: event.botId ?? bot.id, content: event.content });
          // A member finished its reply in a group chat.
          if (event.type === "message")
            setMessages((m) => [...m, event.message as Message]);
          if (event.type === "error") setError(event.error);
        }
      }
      setStream(null);
      setMessages(await api<Message[]>(messagesPath));
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
      setText(content);
    } finally {
      setBusy(false);
      setTaskId("");
    }
  }
  async function loadAttachment(file: File | undefined) {
    if (!file) return;
    try {
      if (!/\.(txt|md)$/i.test(file.name))
        throw new Error(
          "Attach a .txt or .md document. PDF and Office parsing belong to the document workstream.",
        );
      if (file.size > 200000)
        throw new Error("Use a text document smaller than 200 KB.");
      setAttachment({ name: file.name, text: await file.text() });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function download(content: string) {
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/markdown" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}-response.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copy(m: Message) {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopied(m.id);
      setTimeout(() => setCopied((c) => (c === m.id ? "" : c)), 1500);
    } catch {
      setError("Clipboard access is unavailable.");
    }
  }
  async function grant(allow: boolean) {
    try {
      await api("grants", { botId: bot.id, memory: allow });
      setConsent(false);
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const groupTasks = new Set(
    state.tasks.filter((t) => group && t.groupId === group.id).map((t) => t.id),
  );
  const approvals = state.approvals.filter(
    (a) =>
      (group ? groupTasks.has(a.taskId) : a.botId === bot.id) &&
      a.state === "pending" &&
      Date.parse(a.expiresAt) > Date.now(),
  );
  // In a group, each run of replies from one bot is labelled with its name.
  const speaker = (m: Pick<Message, "role" | "botId">) =>
    m.role === "user" ? "user" : m.botId;
  const label = (botId: string) => {
    const b = author(botId);
    return (
      <div className="speaker">
        <Avatar name={b?.name ?? "Bot"} main={botId === bot.id} size={18} />
        {b?.name ?? "A former member"}
      </div>
    );
  };
  const lastSpeaker = messages.length
    ? speaker(messages[messages.length - 1]!)
    : "";
  const empty = messages.length === 0 && !busy;
  return (
    <div className="chat">
      <header className="chat-head drag">
        <div className="bot-pill-wrap" ref={detailsRef}>
          <button
            className="bot-pill"
            aria-expanded={details}
            aria-label={`${title} details`}
            onClick={() => setDetails((d) => !d)}
          >
            {group ? (
              <GroupAvatar names={faces} size={24} />
            ) : (
              <Avatar name={bot.name} main={main} size={24} />
            )}
            {title}
          </button>
          {details && group && (
            <div className="popover bot-details">
              <div className="bot-details-head">
                <GroupAvatar names={faces} size={40} />
                <div>
                  <strong>{group.name}</strong>
                  <small>
                    {members.length + 1} bots · {bot.name} coordinates
                  </small>
                </div>
              </div>
              <div className="group-members">
                {[bot, ...members].map((b) => (
                  <div key={b.id} className="group-member">
                    <Avatar name={b.name} main={b.id === bot.id} size={26} />
                    <span className="bot-text">
                      <strong>{b.name}</strong>
                      <small>{b.id === bot.id ? "Coordinator" : b.role}</small>
                    </span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  closeDetails();
                  onEditGroup?.();
                }}
              >
                <Pencil size={15} />
                <span>Edit members</span>
              </button>
              <button
                className={confirmDelete ? "danger" : ""}
                disabled={!!running}
                onClick={() =>
                  confirmDelete ? onDeleteGroup?.() : setConfirmDelete(true)
                }
              >
                <Trash2 size={15} />
                <span>
                  {confirmDelete ? "Delete for good?" : "Delete group chat"}
                </span>
              </button>
              <p>
                Members see the recent group conversation when {bot.name} asks
                them, and each uses its own permissions.
              </p>
            </div>
          )}
          {details && !group && (
            <div className="popover bot-details">
              <div className="bot-details-head">
                <Avatar name={bot.name} main={main} size={40} />
                <div>
                  <strong>{bot.name}</strong>
                  <small>{bot.role}</small>
                </div>
              </div>
              <button onClick={onSettings}>
                <Settings size={15} />
                <span>Model</span>
                <em>{state.settings.model || "Not set"}</em>
              </button>
              <button
                onClick={() => {
                  setDetails(false);
                  setConsent(true);
                }}
              >
                <BookOpen size={15} />
                <span>Memory</span>
                <em>{memory ? "On" : "Off"}</em>
              </button>
              <p>
                {state.settings.provider === "ollama"
                  ? "Uses a local model connection."
                  : state.settings.provider === "compatible"
                    ? "Uses a custom model endpoint."
                    : "Context is sent to your selected cloud provider."}
              </p>
            </div>
          )}
        </div>
      </header>
      <div className="chat-scroll">
        <div className="thread">
          {empty ? (
            <div className="welcome">
              {group ? (
                <GroupAvatar names={faces} size={72} />
              ) : (
                <Avatar name={bot.name} main={main} size={72} badge={main} />
              )}
              <h1>
                {group
                  ? "What shall we work on together?"
                  : "What shall we work on?"}
              </h1>
              <p>
                {group
                  ? `${bot.name} coordinates ${members.map((b) => b.name).join(", ") || "this group"} and brings in whoever fits.`
                  : main
                    ? "A little more headspace. A lot more done."
                    : `${bot.role}. Give me a clear outcome and I’ll help you get there.`}
              </p>
              <div className="suggestions">
                {(group ? groupSuggestions : suggestions).map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setText(s);
                      input.current?.focus();
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {!state.settings.model && (
                <button className="setup-notice" onClick={onSettings}>
                  <Settings size={16} />
                  <span>Connect a model to start your first conversation</span>
                  <strong>Set up →</strong>
                </button>
              )}
            </div>
          ) : (
            messages.map((m, i) => {
              const next = messages[i + 1],
                prev = messages[i - 1];
              const last =
                (!next || speaker(next) !== speaker(m)) &&
                !(busy && !next && stream && stream.botId === speaker(m));
              const first = !prev || speaker(prev) !== speaker(m);
              return (
                <article
                  key={m.id}
                  className={`message ${m.role} ${last ? "last" : ""}`}
                >
                  {group && first && m.role === "assistant" && label(m.botId)}
                  <div className="bubble">
                    {m.role === "assistant" ? (
                      <Markdown text={m.content} />
                    ) : (
                      <div className="plain">{m.content}</div>
                    )}
                  </div>
                  <div className="message-actions">
                    <time>
                      {new Date(m.createdAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </time>
                    <button
                      className="icon ghost tiny"
                      aria-label="Copy message"
                      onClick={() => void copy(m)}
                    >
                      {copied === m.id ? (
                        <Check size={13} />
                      ) : (
                        <Copy size={13} />
                      )}
                    </button>
                    {m.role === "assistant" && (
                      <button
                        className="icon ghost tiny"
                        aria-label="Save as Markdown"
                        title="Save as Markdown"
                        onClick={() => download(m.content)}
                      >
                        <Download size={13} />
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
          {busy && (
            <article className="message assistant last">
              {group &&
                stream &&
                stream.botId !== lastSpeaker &&
                label(stream.botId)}
              <div className="bubble" aria-live="polite">
                {stream?.content ? (
                  <Markdown text={stream.content} />
                ) : (
                  <span className="typing" aria-label="Working on it">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </div>
            </article>
          )}
          {approvals.map((a) => (
            <ApprovalCard key={a.id} approval={a} onRefresh={onRefresh} />
          ))}
          <div ref={bottom} />
        </div>
      </div>
      <div className="composer-wrap">
        <ErrorNote error={error} />
        {attachment && (
          <div className="attachment">
            <FileText size={15} />
            {attachment.name}
            <button
              className="icon ghost tiny"
              aria-label="Remove attachment"
              onClick={() => setAttachment(null)}
            >
              <X size={13} />
            </button>
          </div>
        )}
        <form className="composer" onSubmit={submit}>
          <button
            type="button"
            className="icon round composer-plus"
            aria-label="Attach a text document"
            onClick={() => upload.current?.click()}
          >
            <Plus size={18} />
          </button>
          <input
            className="hidden"
            ref={upload}
            type="file"
            accept=".txt,.md"
            onChange={(e) => {
              void loadAttachment(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <textarea
            ref={input}
            aria-label={`Message ${title}`}
            placeholder={`Message ${title}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={1}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <button type="button" className="model-chip" onClick={onSettings}>
            {state.settings.model || "Choose model"}
            <ChevronDown size={12} />
          </button>
          {busy || running ? (
            <button
              type="button"
              className="send"
              aria-label="Stop task"
              onClick={() =>
                void api("tasks/cancel", { id: taskId || running?.id }).catch(
                  (e) => setError(e.message),
                )
              }
            >
              <Square size={12} fill="currentColor" />
            </button>
          ) : (
            <button
              className="send"
              aria-label="Send message"
              disabled={!text.trim() || !state.settings.model}
            >
              <ArrowUp size={18} strokeWidth={2.4} />
            </button>
          )}
        </form>
      </div>
      {consent && (
        <Modal title="Memory permissions" onClose={() => setConsent(false)}>
          <p className="muted">
            Allow {bot.name} to search its private memory and propose new
            records. Each proposed save still needs your approval. Memory may be
            included in requests to your selected model provider.
          </p>
          <div className="modal-actions">
            <button onClick={() => void grant(false)}>Revoke access</button>
            <button className="primary" onClick={() => void grant(true)}>
              Allow memory
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
