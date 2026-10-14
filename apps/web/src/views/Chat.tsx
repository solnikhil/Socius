import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUp,
  Bot,
  BookOpen,
  ChevronDown,
  FileText,
  LoaderCircle,
  MessageSquare,
  Plus,
  Settings,
  Square,
  X,
} from "lucide-react";
import type { BotInstance } from "@socius/contracts";
import type { Message, Snapshot } from "@socius/contracts/app";
import { api } from "../api.js";
import { Avatar, Modal, ErrorNote } from "../components/ui.js";
import { ApprovalCard } from "../components/ApprovalCard.js";

export function Chat({
  bot,
  state,
  onRefresh,
  onSettings,
}: {
  bot: BotInstance;
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
    [consent, setConsent] = useState(false);
  const bottom = useRef<HTMLDivElement>(null),
    upload = useRef<HTMLInputElement>(null);
  const running = state.tasks.find(
    (t) => t.botId === bot.id && t.state === "running",
  );
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
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, stream]);
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
  const approvals = state.approvals.filter(
    (a) =>
      a.botId === bot.id &&
      a.state === "pending" &&
      Date.parse(a.expiresAt) > Date.now(),
  );
  return (
    <div className="chat">
      <div className="chat-scroll">
        {messages.length === 0 && !busy ? (
          <div className="welcome">
            <Avatar name={bot.name} large />
            <span className="eyebrow">
              YOUR {bot.name === "Socius" ? "AI ALLY" : "SPECIALIST"}
            </span>
            <h1>What shall we work on?</h1>
            <p>
              {bot.name === "Socius"
                ? "A little more headspace. A lot more done."
                : "Give me a clear outcome and I’ll help you get there."}
            </p>
            <div className="suggestions">
              {[
                {
                  icon: <Bot size={19} />,
                  title: "Build your bot team",
                  text: "Create a research bot that turns my supplied sources into evidence-based briefs.",
                },
                {
                  icon: <FileText size={19} />,
                  title: "Make sense of a document",
                  text: "Help me summarise a document. I’ll attach it here.",
                },
                {
                  icon: <MessageSquare size={19} />,
                  title: "Think something through",
                  text: "Help me make a plan for the work I need to get done today.",
                },
              ].map((s) => (
                <button key={s.title} onClick={() => setText(s.text)}>
                  {s.icon}
                  <strong>{s.title}</strong>
                  <span>{s.text}</span>
                </button>
              ))}
            </div>
            {!state.settings.model && (
              <button className="setup-notice" onClick={onSettings}>
                <Settings size={17} />
                <span>Connect a model to start your first conversation</span>
                <span>Set up →</span>
              </button>
            )}
          </div>
        ) : (
          <div className="messages">
            {messages.map((m) => (
              <article key={m.id} className={`message ${m.role}`}>
                <Avatar name={m.role === "user" ? "You" : bot.name} />
                <div>
                  <div className="message-label">
                    {m.role === "user" ? "You" : bot.name}
                    <time>
                      {new Date(m.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  <div className="message-content">{m.content}</div>
                  {m.role === "assistant" && (
                    <button
                      className="text-button"
                      onClick={() => {
                        const url = URL.createObjectURL(
                          new Blob([m.content], { type: "text/markdown" }),
                        );
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${bot.name}-response.md`;
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                      }}
                    >
                      Save as Markdown
                    </button>
                  )}
                </div>
              </article>
            ))}
            {busy && (
              <article className="message assistant">
                <Avatar name={bot.name} />
                <div>
                  <div className="message-label">
                    {bot.name}
                    <LoaderCircle size={13} className="spin" />
                  </div>
                  <div className="message-content" aria-live="polite">
                    {stream || "Working on it…"}
                  </div>
                </div>
              </article>
            )}
          </div>
        )}
        {approvals.map((a) => (
          <ApprovalCard key={a.id} approval={a} onRefresh={onRefresh} />
        ))}
        <div ref={bottom} />
      </div>
      <div className="composer-wrap">
        <ErrorNote error={error} />
        {attachment && (
          <div className="attachment">
            <FileText size={16} />
            {attachment.name}
            <button
              aria-label="Remove attachment"
              onClick={() => setAttachment(null)}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <form className="composer" onSubmit={submit}>
          <textarea
            aria-label={`Message ${bot.name}`}
            placeholder={`Message ${bot.name}…`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
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
          <div className="composer-tools">
            <div>
              <button
                type="button"
                className="icon"
                aria-label="Attach a text document"
                onClick={() => upload.current?.click()}
              >
                <Plus size={20} />
              </button>
              <input
                className="hidden"
                ref={upload}
                type="file"
                accept=".txt,.md"
                onChange={(e) => void loadAttachment(e.target.files?.[0])}
              />
              <button type="button" className="model-chip" onClick={onSettings}>
                {state.settings.model || "Choose model"}
                <ChevronDown size={13} />
              </button>
            </div>
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
                <Square size={15} />
              </button>
            ) : (
              <button
                className="send"
                aria-label="Send message"
                disabled={!text.trim() || !state.settings.model}
              >
                <ArrowUp size={20} />
              </button>
            )}
          </div>
        </form>
        <div className="composer-foot">
          <span>
            {state.settings.provider === "ollama"
              ? "Local model connection"
              : state.settings.provider === "compatible"
                ? "Custom model endpoint"
                : "Context is sent to your selected cloud provider"}
          </span>
          <button className="text-button" onClick={() => setConsent(true)}>
            <BookOpen size={12} />
            {bot.grantedCapabilities.includes("memory.read")
              ? "Memory enabled"
              : "Enable memory"}
          </button>
        </div>
      </div>
      {consent && (
        <Modal title="Memory permissions" onClose={() => setConsent(false)}>
          <p>
            Allow {bot.name} to search its private memory and propose new
            records. Each proposed save still needs your approval. Memory may be
            included in requests to your selected model provider.
          </p>
          <div className="modal-actions">
            <button
              onClick={() =>
                void api("grants", { botId: bot.id, memory: false }).then(
                  () => {
                    setConsent(false);
                    void onRefresh();
                  },
                )
              }
            >
              Revoke access
            </button>
            <button
              className="primary"
              onClick={() =>
                void api("grants", { botId: bot.id, memory: true }).then(() => {
                  setConsent(false);
                  void onRefresh();
                })
              }
            >
              Allow memory
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
