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
  Plus,
  Settings,
  Square,
  X,
} from "lucide-react";
import type { BotInstance } from "@socius/contracts";
import type { Message, Snapshot } from "@socius/contracts/app";
import { api } from "../api.js";
import {
  Avatar,
  ErrorNote,
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

export function Chat({
  bot,
  main,
  state,
  onRefresh,
  onSettings,
}: {
  bot: BotInstance;
  main: boolean;
  state: Snapshot;
  onRefresh: () => Promise<void>;
  onSettings: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [text, setText] = useState(""),
    [stream, setStream] = useState(""),
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
  const closeDetails = useCallback(() => setDetails(false), []);
  const detailsRef = useDismiss(details, closeDetails);
  const running = state.tasks.find(
    (t) => t.botId === bot.id && t.state === "running",
  );
  const memory = bot.grantedCapabilities.includes("memory.read");
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const next = await api<Message[]>(`messages?botId=${bot.id}`);
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
  }, [bot.id, busy]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, stream]);
  useEffect(() => {
    input.current?.focus();
  }, [bot.id]);
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
    setStream("");
    const content = text;
    setText("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botId: bot.id,
          content,
          ...(attachment ? { attachment } : {}),
        }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error);
      }
      setAttachment(null);
      setMessages(await api<Message[]>(`messages?botId=${bot.id}`));
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
          if (event.type === "text") setStream(event.content);
          if (event.type === "error") setError(event.error);
        }
      }
      setStream("");
      setMessages(await api<Message[]>(`messages?botId=${bot.id}`));
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
    a.download = `${bot.name}-response.md`;
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
  const approvals = state.approvals.filter(
    (a) =>
      a.botId === bot.id &&
      a.state === "pending" &&
      Date.parse(a.expiresAt) > Date.now(),
  );
  const empty = messages.length === 0 && !busy;
  return (
    <div className="chat">
      <header className="chat-head drag">
        <div className="bot-pill-wrap" ref={detailsRef}>
          <button
            className="bot-pill"
            aria-expanded={details}
            aria-label={`${bot.name} details`}
            onClick={() => setDetails((d) => !d)}
          >
            <Avatar name={bot.name} main={main} size={24} />
            {bot.name}
          </button>
          {details && (
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
              <Avatar name={bot.name} main={main} size={72} badge={main} />
              <h1>What shall we work on?</h1>
              <p>
                {main
                  ? "A little more headspace. A lot more done."
                  : `${bot.role}. Give me a clear outcome and I’ll help you get there.`}
              </p>
              <div className="suggestions">
                {suggestions.map((s) => (
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
              const next = messages[i + 1];
              const last = !next || next.role !== m.role;
              return (
                <article
                  key={m.id}
                  className={`message ${m.role} ${last ? "last" : ""}`}
                >
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
              <div className="bubble" aria-live="polite">
                {stream ? (
                  <Markdown text={stream} />
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
            aria-label={`Message ${bot.name}`}
            placeholder={`Message ${bot.name}`}
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
