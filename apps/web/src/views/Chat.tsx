import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Copy,
  Download,
  FileText,
  Pencil,
  Plus,
  Puzzle,
  Settings,
  Square,
  Trash2,
  X,
} from "lucide-react";
import type { BotInstance } from "@socius/contracts";
import {
  type GroupChat,
  type Message,
  type Reaction,
  type Snapshot,
} from "@socius/contracts/app";
import { requestKey, requestKnown, api } from "../api.js";
import {
  Avatar,
  ErrorNote,
  GroupAvatar,
  Markdown,
  Modal,
} from "../components/chrome.js";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ApprovalCard } from "../components/ApprovalCard.js";
import {
  closeOpenMarks,
  useSmoothText,
  useStickToBottom,
} from "../components/streaming.js";
import { ReactionPicker } from "../components/Reactions.js";
import { ActionCard, needsAttention } from "../components/ActionCard.js";
import { ExportBot } from "./ExportBot.js";
import { BotSkills } from "./BotSkills.js";
import { BotModelMenu } from "../components/ModelPicker.js";
import { resolvedModel, SETUP_CODES, type OpenSettings } from "../models.js";

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
  onSettings: OpenSettings;
  onEditGroup?: () => void;
  onDeleteGroup?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [text, setText] = useState(""),
    [stream, setStream] = useState<{ botId: string; content: string } | null>(
      null,
    ),
    [confirmDelete, setConfirmDelete] = useState(false),
    // The reply whose reaction picker is open.
    [reacting, setReacting] = useState(""),
    // The reply whose reaction badge is animating out.
    [leaving, setLeaving] = useState(""),
    [busy, setBusy] = useState(false),
    [taskId, setTaskId] = useState(""),
    [error, setError] = useState(""),
    [errorCode, setErrorCode] = useState(""),
    [attachment, setAttachment] = useState<{
      name: string;
      text: string;
    } | null>(null),
    [consent, setConsent] = useState(false),
    [details, setDetails] = useState(false),
    [exporting, setExporting] = useState(false),
    [skillsOpen, setSkillsOpen] = useState(false),
    [copied, setCopied] = useState("");
  const streamAbort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null),
    thread = useRef<HTMLDivElement>(null),
    upload = useRef<HTMLInputElement>(null),
    input = useRef<HTMLTextAreaElement>(null);
  const closeDetails = useCallback(() => {
    setDetails(false);
    setConfirmDelete(false);
  }, []);
  useEffect(() => {
    const recover = () => {
      if (document.visibilityState === "visible") streamAbort.current?.abort();
    };
    const disconnect = () => streamAbort.current?.abort();
    document.addEventListener("visibilitychange", recover);
    window.addEventListener("offline", disconnect);
    return () => {
      document.removeEventListener("visibilitychange", recover);
      window.removeEventListener("offline", disconnect);
      streamAbort.current?.abort();
    };
  }, []);
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
      // Routine attempts run in the background and never block this chat.
      !t.routineRunId &&
      (group ? t.groupId === group.id : t.botId === bot.id && !t.groupId),
  );
  const memory = bot.grantedCapabilities.includes("memory.read");
  // A group reply that failed or was cut off by a restart can be run again.
  const lastAsk = group
    ? messages.filter((m) => m.role === "user").at(-1)
    : undefined;
  const unfinished =
    busy || running
      ? undefined
      : state.tasks.find(
          (t) =>
            t.id === lastAsk?.taskId &&
            (t.state === "failed" || t.state === "cancelled"),
        );
  const model = resolvedModel(state, bot.id);
  const fail = (message: string, code = "") => {
    setError(message);
    setErrorCode(code);
  };
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const snapshot = await api<{
          messages: Message[];
          lastEventId: string | null;
        }>(
          `chats/${conversation}?since=${encodeURIComponent(messages.at(-1)?.id ?? "")}`,
        );
        const next = snapshot.messages;
        if (mounted) setMessages(next);
      } catch (e) {
        if (mounted) fail((e as Error).message);
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
  // Follows new output only while the reader is at the bottom.
  const { atBottom, pin } = useStickToBottom(scroller, thread);
  const streamed = useSmoothText(stream?.content ?? "");
  useEffect(() => pin(), [conversation, pin]);
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
    const content = text;
    setText("");
    pin(true);
    const sent = await converse(group ? "groups/chat" : "chat", {
      ...(group ? { groupId: group.id } : { botId: bot.id }),
      content,
      ...(attachment ? { attachment } : {}),
    });
    if (sent) setAttachment(null);
    else setText(content);
  }
  /** Re-runs the group's last message after its reply failed or was cut off. */
  async function retry() {
    if (!group || busy || running) return;
    pin(true);
    await converse("groups/retry", { groupId: group.id });
  }
  /** Posts a turn and streams its events; false when the request was refused. */
  async function converse(path: string, payload: unknown) {
    if (!navigator.onLine) {
      fail("Offline. Reconnect before sending.");
      return false;
    }
    setBusy(true);
    fail("");
    setStream(null);
    let accepted = false;
    try {
      const controller = new AbortController();
      streamAbort.current = controller;
      const response = await fetch(`/api/${path}`, {
        signal: controller.signal,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": requestKey(path, payload),
        },
        body: JSON.stringify(payload),
      });
      if (response.status !== 409) requestKnown(path, payload);
      if (!response.ok) {
        const result = await response.json();
        throw Object.assign(new Error(result.error), {
          code: result.code ?? "",
        });
      }
      accepted = true;
      if (response.headers.get("content-type")?.includes("application/json")) {
        const saved = await response.json();
        if (saved.taskId) setTaskId(saved.taskId);
        setMessages(await api<Message[]>(messagesPath));
        await onRefresh();
        return true;
      }
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
          // The bot is waiting on a review card; show it right away.
          if (event.type === "approval") void onRefresh();
          if (event.type === "text")
            setStream({ botId: event.botId ?? bot.id, content: event.content });
          // A member finished its reply in a group chat.
          if (event.type === "message") {
            const message = event.message as Message;
            setMessages((messages) =>
              messages.some((m) => m.id === message.id)
                ? messages.map((m) => (m.id === message.id ? message : m))
                : [...messages, message],
            );
            setStream((current) =>
              current?.botId === message.botId ? null : current,
            );
          }
          if (event.type === "error") fail(event.error, event.code ?? "");
        }
      }
      setStream(null);
      setMessages(await api<Message[]>(messagesPath));
      await onRefresh();
    } catch (e) {
      if ((e as Error).name === "AbortError" && accepted) {
        try {
          setMessages(await api<Message[]>(messagesPath));
          await onRefresh();
        } catch {
          /* Connection banner explains offline recovery. */
        }
      } else fail((e as Error).message, (e as { code?: string }).code ?? "");
    } finally {
      setBusy(false);
      setTaskId("");
    }
    return accepted;
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
      fail("");
    } catch (e) {
      fail((e as Error).message);
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
  async function react(m: Message, reaction: Reaction) {
    setReacting("");
    const next = m.reaction === reaction ? null : reaction;
    const swap = (r: Reaction | null) =>
      setMessages((list) =>
        list.map((x) => {
          if (x.id !== m.id) return x;
          const { reaction: _old, ...rest } = x;
          return r ? { ...rest, reaction: r } : rest;
        }),
      );
    swap(next);
    try {
      await api<Message>("messages/react", { id: m.id, reaction: next });
    } catch (e) {
      swap(m.reaction ?? null);
      fail((e as Error).message);
    }
  }
  // The badge shrinks away first, then the reaction is cleared.
  function unreact(m: Message) {
    if (!m.reaction || leaving) return;
    setLeaving(m.id);
    setTimeout(
      () => {
        setLeaving("");
        void react(m, m.reaction!);
      },
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 170,
    );
  }
  async function copy(m: Message) {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopied(m.id);
      setTimeout(() => setCopied((c) => (c === m.id ? "" : c)), 1500);
    } catch {
      fail("Clipboard access is unavailable.");
    }
  }
  async function grant(allow: boolean) {
    try {
      await api("grants", { botId: bot.id, memory: allow });
      setConsent(false);
      await onRefresh();
    } catch (e) {
      fail((e as Error).message);
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
  // Group work raises its changes in the group; direct chats show only their own.
  const groupOf = new Map(state.tasks.map((t) => [t.id, t.groupId ?? null]));
  const actions = state.actions
    .filter(
      (a) =>
        (group
          ? groupOf.get(a.actor.taskId) === group.id
          : a.actor.botId === bot.id &&
            !a.actor.boardId &&
            !groupOf.get(a.actor.taskId)) &&
        (needsAttention(a) || a.state === "succeeded"),
    )
    .slice(-5);
  // A running reply that is paused on the user's review.
  const waiting = actions.find(
    (a) =>
      a.state === "pending" &&
      a.actor.taskId === (taskId || running?.id) &&
      Date.parse(a.expiresAt) > Date.now(),
  );
  // In a group, each run of replies from one bot is labelled with its name.
  const speaker = (m: Pick<Message, "role" | "botId">) =>
    m.role === "user" ? "user" : m.botId;
  const label = (botId: string) => {
    const b = author(botId);
    return (
      <div className="speaker">
        <Avatar
          name={b?.name ?? "Bot"}
          main={botId === bot.id}
          size={18}
          appearance={b?.appearance}
          busy={busy && stream?.botId === botId}
        />
        {b?.name ?? "A former member"}
      </div>
    );
  };
  const lastSpeaker = messages.length
    ? speaker(messages[messages.length - 1]!)
    : "";
  const empty = messages.length === 0 && !busy;
  const working = busy || !!running;
  return (
    <div className="chat">
      <header className="chat-head drag">
        <div className="bot-pill-wrap">
          <Popover
            open={details}
            onOpenChange={(next) => {
              setDetails(next);
              if (!next) setConfirmDelete(false);
            }}
          >
            <PopoverTrigger asChild>
              <button className="bot-pill" aria-label={`${title} details`}>
                {group ? (
                  <GroupAvatar names={faces} size={24} busy={working} />
                ) : (
                  <Avatar
                    name={bot.name}
                    main={main}
                    size={24}
                    appearance={bot.appearance}
                    busy={working}
                  />
                )}
                {title}
              </button>
            </PopoverTrigger>
            {group && (
              <PopoverContent
                side="bottom"
                align="center"
                className="floating-panel bot-details"
              >
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
                      <Avatar
                        name={b.name}
                        main={b.id === bot.id}
                        size={26}
                        appearance={b.appearance}
                      />
                      <span className="bot-text">
                        <strong>{b.name}</strong>
                        <small>
                          {b.id === bot.id ? "Coordinator" : b.role}
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
                <BotModelMenu
                  bot={bot}
                  state={state}
                  onRefresh={onRefresh}
                  onSettings={onSettings}
                  onError={(m) => fail(m)}
                  onClose={closeDetails}
                />
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
              </PopoverContent>
            )}
            {!group && (
              <PopoverContent
                side="bottom"
                align="center"
                className="floating-panel bot-details"
              >
                <div className="bot-details-head">
                  <Avatar
                    name={bot.name}
                    main={main}
                    size={40}
                    appearance={bot.appearance}
                    busy={working}
                  />
                  <div>
                    <strong>{bot.name}</strong>
                    <small>{bot.role}</small>
                  </div>
                </div>
                <BotModelMenu
                  bot={bot}
                  state={state}
                  onRefresh={onRefresh}
                  onSettings={onSettings}
                  onError={(m) => fail(m)}
                  onClose={() => setDetails(false)}
                />
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
                <button
                  onClick={() => {
                    setDetails(false);
                    setSkillsOpen(true);
                  }}
                >
                  <Puzzle size={15} />
                  <span>Skills</span>
                  <em>
                    {state.skillReviews.some((r) => r.botId === bot.id)
                      ? "Review"
                      : state.skillAssignments.filter((a) => a.botId === bot.id)
                          .length}
                  </em>
                </button>
                <button
                  onClick={() => {
                    setDetails(false);
                    setExporting(true);
                  }}
                >
                  <Download size={15} />
                  <span>Export as template</span>
                </button>
              </PopoverContent>
            )}
          </Popover>
        </div>
      </header>
      <div className="chat-scroll" ref={scroller} tabIndex={-1}>
        <div className="thread" ref={thread}>
          {empty ? (
            <div className="welcome">
              {group ? (
                <GroupAvatar names={faces} size={72} />
              ) : (
                <Avatar
                  name={bot.name}
                  main={main}
                  size={72}
                  badge={main}
                  appearance={bot.appearance}
                />
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
              {!model && (
                <button
                  className="setup-notice"
                  onClick={() =>
                    onSettings(
                      state.connections.length ? "models" : "providers",
                    )
                  }
                >
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
                  className={`message ${m.role} ${last ? "last" : ""} ${m.reaction ? "reacted" : ""}`}
                >
                  {group && first && m.role === "assistant" && label(m.botId)}
                  <div className="bubble-row">
                    <div className="bubble">
                      {m.role === "assistant" ? (
                        <Markdown text={m.content} />
                      ) : (
                        <div className="plain">{m.content}</div>
                      )}
                      {m.reaction && (
                        <button
                          key={m.reaction}
                          className={`reaction-badge ${leaving === m.id ? "leaving" : ""}`}
                          aria-label={`Remove your ${m.reaction} reaction`}
                          title="Remove reaction"
                          onClick={() => unreact(m)}
                        >
                          {m.reaction}
                        </button>
                      )}
                    </div>
                    {m.role === "assistant" && (
                      <ReactionPicker
                        current={m.reaction}
                        open={reacting === m.id}
                        onToggle={(open) => setReacting(open ? m.id : "")}
                        onPick={(r) => void react(m, r)}
                      />
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
              <div
                className={`bubble streaming ${streamed ? "" : "waiting"}`}
                aria-live="polite"
                aria-busy="true"
              >
                {streamed ? (
                  <Markdown text={closeOpenMarks(streamed)} />
                ) : (
                  <span className="thinking">
                    {(stream && author(stream.botId)?.name) ?? bot.name} is{" "}
                    {waiting ? "waiting for you" : "working"}
                  </span>
                )}
              </div>
            </article>
          )}
          {approvals.map((a) => (
            <ApprovalCard key={a.id} approval={a} onRefresh={onRefresh} />
          ))}
          {actions.map((a) => (
            <ActionCard
              key={a.id}
              action={a}
              state={state}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      </div>
      <div className="composer-wrap">
        {!atBottom && (
          <button
            type="button"
            className="jump-latest"
            onClick={() => pin(true)}
          >
            <ArrowDown size={14} />
            {busy ? "New reply below" : "Jump to latest"}
          </button>
        )}
        <ErrorNote
          // After a reload the failure comes from the task, not this session.
          error={error || (unfinished?.error ?? "")}
          action={
            !error && unfinished
              ? { label: "Retry reply", onClick: () => void retry() }
              : SETUP_CODES.has(errorCode) ||
                  (!errorCode && /Settings/.test(error))
                ? {
                    label: "Open Settings",
                    onClick: () =>
                      // Wrong model or missing tools are fixed in Models; credentials
                      // and endpoints on the connection itself.
                      ["model_not_found", "tools_unsupported"].includes(
                        errorCode,
                      ) ||
                      (!errorCode && state.connections.length > 0)
                        ? onSettings("models")
                        : onSettings("providers", model?.entry.connectionId),
                  }
                : unfinished
                  ? { label: "Retry reply", onClick: () => void retry() }
                  : undefined
          }
        />
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
          {busy || running ? (
            <button
              type="button"
              className="send"
              aria-label="Stop task"
              onClick={() =>
                void api("tasks/cancel", { id: taskId || running?.id }).catch(
                  (e) => fail(e.message),
                )
              }
            >
              <Square size={12} fill="currentColor" />
            </button>
          ) : (
            <button
              className="send"
              aria-label="Send message"
              disabled={!text.trim() || !model}
            >
              <ArrowUp size={18} strokeWidth={2.4} />
            </button>
          )}
        </form>
      </div>
      {exporting && <ExportBot bot={bot} onClose={() => setExporting(false)} />}
      {skillsOpen && (
        <BotSkills
          bot={bot}
          state={state}
          onRefresh={onRefresh}
          onClose={() => setSkillsOpen(false)}
        />
      )}
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
