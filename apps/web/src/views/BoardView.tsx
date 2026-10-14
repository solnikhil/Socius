import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUp,
  Archive,
  ArchiveRestore,
  Crown,
  FileText,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { BotInstance } from "@socius/contracts";
import type {
  Board,
  BoardBudgets,
  BoardDetail,
  BoardMessage,
  BoardRun,
  BoardTask,
  Snapshot,
} from "@socius/contracts/app";
import { columnOf, type BoardColumn } from "@socius/teams";
import { api } from "../api.js";
import { Avatar, ErrorNote, Markdown } from "../components/ui.js";

export type BoardTab = "thread" | "tasks" | "team" | "sources";
type Tab = BoardTab;
const tabs: { id: Tab; label: string }[] = [
  { id: "thread", label: "Thread" },
  { id: "tasks", label: "Tasks" },
  { id: "team", label: "Team" },
  { id: "sources", label: "Sources" },
];
const activeStates = new Set(["planning", "running", "synthesizing"]);
const runLabel: Record<BoardRun["state"], string> = {
  planning: "Planning",
  "awaiting-approval": "Plan ready for review",
  running: "Working",
  synthesizing: "Writing final result",
  completed: "Completed",
  partial: "Needs attention",
  failed: "Failed",
  cancelled: "Stopped",
  interrupted: "Interrupted",
};
const kindLabel: Record<BoardMessage["kind"], string> = {
  user: "You",
  decision: "Plan",
  contribution: "Contribution",
  blocker: "Blocker",
  synthesis: "Final result",
};

export function BoardView({
  boardId,
  state,
  onRefresh,
  onClose,
  onSettings,
  initialTab = "thread",
  onCreateBot,
}: {
  boardId: string;
  state: Snapshot;
  onRefresh: () => Promise<void>;
  onClose: () => void;
  onSettings: () => void;
  initialTab?: Tab;
  onCreateBot: (board: Board) => void;
}) {
  const [detail, setDetail] = useState<BoardDetail | null>(null),
    [tab, setTab] = useState<Tab>(initialTab),
    [error, setError] = useState(""),
    [offline, setOffline] = useState(false);
  const loaded = useRef(false);
  async function load() {
    try {
      setDetail(await api<BoardDetail>(`boards/detail?id=${boardId}`));
      loaded.current = true;
      setOffline(false);
    } catch (e) {
      // Keep the last known board visible while the runtime reconnects.
      if (loaded.current) setOffline(true);
      else setError((e as Error).message);
    }
  }
  useEffect(() => {
    loaded.current = false;
    setDetail(null);
    void load();
    const timer = setInterval(() => void load(), 1500);
    return () => clearInterval(timer);
  }, [boardId]);
  async function act(path: string, body: unknown, method?: string) {
    setError("");
    try {
      await api(path, body, method);
      await load();
      void onRefresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }
  if (!detail)
    return (
      <div className="page-frame">
        <header className="page-bar drag">
          <span>Board</span>
        </header>
        <div className="empty" role="status">
          {error ? <ErrorNote error={error} /> : <p>Loading board…</p>}
        </div>
      </div>
    );
  const { board } = detail;
  const bot = (id: string) => state.bots.find((b) => b.id === id);
  const run = detail.runs.at(-1);
  const active = !!run && activeStates.has(run.state);
  const archived = !!board.archivedAt;
  return (
    <div className="page-frame board">
      <header className="page-bar drag board-bar">
        <div className="board-title">
          <strong>{board.name}</strong>
          {run && (
            <span
              className={`run-chip ${run.state}`}
              role="status"
              aria-live="polite"
            >
              {active && <span className="pulse dot-live" />}
              {runLabel[run.state]}
            </span>
          )}
          {archived && <span className="run-chip">Archived</span>}
        </div>
        <div className="board-actions">
          {active && (
            <button
              className="pill"
              onClick={() => void act("boards/stop", { boardId: board.id })}
            >
              <Square size={13} />
              Stop team
            </button>
          )}
          <button className="icon ghost" aria-label="Close" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
      </header>
      <nav className="board-tabs" role="tablist" aria-label="Board sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            className={tab === t.id ? "selected" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === "team" && <span>{board.members.length}</span>}
            {t.id === "sources" && <span>{detail.sources.length}</span>}
          </button>
        ))}
      </nav>
      {offline && (
        <div className="reconnecting" role="status">
          Reconnecting to Socius… showing the last saved board.
        </div>
      )}
      <ErrorNote error={error} />
      <div
        className="board-panel"
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {tab === "thread" && (
          <Thread
            detail={detail}
            bot={bot}
            run={run}
            active={active}
            archived={archived}
            hasModel={!!state.settings.model}
            onSettings={onSettings}
            act={act}
          />
        )}
        {tab === "tasks" && (
          <Tasks detail={detail} state={state} bot={bot} act={act} />
        )}
        {tab === "team" && (
          <Team
            board={board}
            state={state}
            bot={bot}
            act={act}
            onCreateBot={() => onCreateBot(board)}
          />
        )}
        {tab === "sources" && <Sources detail={detail} act={act} />}
      </div>
    </div>
  );
}

type Act = (path: string, body: unknown, method?: string) => Promise<boolean>;
type BotLookup = (id: string) => BotInstance | undefined;

function Thread({
  detail,
  bot,
  run,
  active,
  archived,
  hasModel,
  onSettings,
  act,
}: {
  detail: BoardDetail;
  bot: BotLookup;
  run: BoardRun | undefined;
  active: boolean;
  archived: boolean;
  hasModel: boolean;
  onSettings: () => void;
  act: Act;
}) {
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [detail.messages.length]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    if (await act("boards/runs", { boardId: detail.board.id, content: text }))
      setText("");
  }
  const coordinatorName =
    bot(detail.board.coordinatorId)?.name ?? "The coordinator";
  const awaiting = run?.state === "awaiting-approval";
  const retryable =
    run &&
    ["partial", "failed", "cancelled", "interrupted"].includes(run.state);
  return (
    <>
      <div className="board-scroll">
        <div className="board-thread">
          {!detail.messages.length && (
            <div className="board-intro">
              <h2>{detail.board.objective}</h2>
              <p className="muted">
                Ask the team for something. {coordinatorName} picks the members
                that fit
                {detail.board.reviewPlan
                  ? ", shows you the plan here first, and starts once you approve it."
                  : " and starts right away."}{" "}
                You get one consolidated result.
              </p>
              <ul className="intro-roster" aria-label="Team">
                {detail.board.members.map((m) => {
                  const b = bot(m.botId);
                  return (
                    <li key={m.botId}>
                      <Avatar
                        name={b?.name ?? "Unavailable"}
                        main={b?.template.id === "socius/main"}
                        size={26}
                      />
                      <span>
                        <strong>
                          {b?.name ?? "Unavailable bot"}
                          {m.botId === detail.board.coordinatorId &&
                            " · coordinator"}
                        </strong>
                        <small>{m.role || b?.role}</small>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {detail.messages.map((m) => {
            const author = m.botId ? bot(m.botId) : undefined;
            return (
              <article key={m.id} className={`board-message ${m.kind}`}>
                {m.kind !== "user" && (
                  <Avatar
                    name={author?.name ?? "Socius"}
                    main={author?.template.id === "socius/main"}
                    size={28}
                  />
                )}
                <div>
                  <header>
                    <strong>
                      {m.kind === "user" ? "You" : (author?.name ?? "Board")}
                    </strong>
                    {m.kind !== "user" && (
                      <span className="kind">{kindLabel[m.kind]}</span>
                    )}
                    <time>{new Date(m.createdAt).toLocaleTimeString()}</time>
                  </header>
                  <div className="board-bubble">
                    {m.kind === "user" ? (
                      <p className="plain">{m.content}</p>
                    ) : (
                      <Markdown text={m.content} />
                    )}
                  </div>
                </div>
              </article>
            );
          })}
          {awaiting && run && (
            <div className="plan-actions" role="group" aria-label="Plan review">
              <button
                className="primary"
                disabled={archived || !hasModel}
                onClick={() => void act("boards/runs/approve", { id: run.id })}
              >
                Run plan
              </button>
              <button
                className="pill"
                onClick={() => void act("boards/runs/cancel", { id: run.id })}
              >
                Discard
              </button>
              <small>Or reply below to change it.</small>
            </div>
          )}
          {retryable && (
            <div className="outcome" role="status">
              <p>{run.outcome ?? "This run did not finish."}</p>
              <button
                className="pill"
                onClick={() => void act("boards/runs/retry", { id: run.id })}
                disabled={archived || !hasModel}
              >
                <RotateCcw size={14} />
                Retry outstanding work
              </button>
            </div>
          )}
          <div ref={bottom} />
        </div>
      </div>
      <div className="composer-wrap">
        {!hasModel ? (
          <button className="setup-notice" onClick={onSettings}>
            <strong>Connect a model</strong> to run this board.
          </button>
        ) : (
          <form className="composer" onSubmit={submit}>
            <textarea
              aria-label="Message the team"
              placeholder={
                archived
                  ? "This board is archived."
                  : active
                    ? "The team is working. Stop it to send a new request."
                    : awaiting
                      ? "Reply to change the plan…"
                      : "Ask the team…"
              }
              value={text}
              disabled={archived || active}
              rows={1}
              maxLength={20000}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button
              className="send"
              aria-label="Send to team"
              disabled={!text.trim() || archived || active}
            >
              <ArrowUp size={17} />
            </button>
          </form>
        )}
      </div>
    </>
  );
}

const columns: { id: BoardColumn; label: string }[] = [
  { id: "backlog", label: "Backlog" },
  { id: "ready", label: "Ready" },
  { id: "working", label: "Working" },
  { id: "review", label: "Needs input" },
  { id: "done", label: "Done" },
];
function Tasks({
  detail,
  state,
  bot,
  act,
}: {
  detail: BoardDetail;
  state: Snapshot;
  bot: BotLookup;
  act: Act;
}) {
  const run = detail.runs.at(-1);
  const tasks = run ? detail.tasks.filter((t) => t.runId === run.id) : [];
  if (!run || !tasks.length)
    return (
      <div className="page">
        <div className="empty">
          <h2>No tasks yet</h2>
          <p>Tasks appear here once the coordinator plans a request.</p>
        </div>
      </div>
    );
  const grouped = (c: BoardColumn) =>
    tasks.filter((t) => columnOf(t, tasks, state.approvals) === c);
  const history = grouped("history");
  return (
    <div className="board-scroll">
      <p className="task-summary">
        Latest request: <em>{run.request}</em> · {run.usage.modelCalls} model
        calls · {run.usage.tokens.toLocaleString()} tokens
      </p>
      <div className="kanban">
        {columns.map((c) => (
          <section key={c.id} aria-label={c.label}>
            <h3>
              {c.label} <span>{grouped(c.id).length}</span>
            </h3>
            {grouped(c.id).map((t) => (
              <TaskCard key={t.id} task={t} bot={bot} act={act} />
            ))}
          </section>
        ))}
      </div>
      {history.length > 0 && (
        <section className="task-history" aria-label="History">
          <h3>Failed, cancelled and interrupted</h3>
          {history.map((t) => (
            <TaskCard key={t.id} task={t} bot={bot} act={act} />
          ))}
        </section>
      )}
    </div>
  );
}
function TaskCard({
  task,
  bot,
  act,
}: {
  task: BoardTask;
  bot: BotLookup;
  act: Act;
}) {
  const assignee = bot(task.assigneeId);
  const cancellable = ["backlog", "ready", "working"].includes(task.state);
  return (
    <article className={`task-card ${task.state}`}>
      <header>
        <strong>{task.title}</strong>
        {cancellable && (
          <button
            className="icon tiny ghost"
            aria-label={`Cancel ${task.title}`}
            title="Cancel task"
            onClick={() => void act("boards/tasks/cancel", { id: task.id })}
          >
            <X size={13} />
          </button>
        )}
      </header>
      <span className="assignee">
        <Avatar name={assignee?.name ?? "Former member"} size={18} />
        {assignee?.name ?? "Former member"}
        <em>{task.state}</em>
      </span>
      {task.error && <p className="task-error">{task.error}</p>}
      {task.result && (
        <details>
          <summary>Result</summary>
          <Markdown text={task.result} />
        </details>
      )}
    </article>
  );
}

const budgetFields: { key: keyof BoardBudgets; label: string; hint: string }[] =
  [
    { key: "concurrency", label: "Parallel tasks", hint: "Extra work queues" },
    { key: "maxTasks", label: "Tasks per run", hint: "Plan size limit" },
    {
      key: "maxModelCalls",
      label: "Model calls per run",
      hint: "Includes planning",
    },
    { key: "maxRunTokens", label: "Tokens per run", hint: "Spend limit" },
    {
      key: "maxStepsPerCall",
      label: "Steps per call",
      hint: "Tool-loop steps",
    },
    {
      key: "maxOutputTokens",
      label: "Output tokens per call",
      hint: "Response length",
    },
    {
      key: "callTimeoutMs",
      label: "Call timeout (ms)",
      hint: "Per model call",
    },
  ];
function Team({
  board,
  state,
  bot,
  act,
  onCreateBot,
}: {
  board: Board;
  state: Snapshot;
  bot: BotLookup;
  act: Act;
  onCreateBot: () => void;
}) {
  const [adding, setAdding] = useState("");
  const archived = !!board.archivedAt;
  const outside = state.bots.filter(
    (b) => !board.members.some((m) => m.botId === b.id),
  );
  async function saveBudgets(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    await act("boards/update", {
      id: board.id,
      budgets: Object.fromEntries(
        budgetFields.map((f) => [f.key, Number(data.get(f.key))]),
      ),
    });
  }
  async function saveBrief(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    await act("boards/update", {
      id: board.id,
      name: data.get("name"),
      objective: data.get("objective"),
      completionCriteria: data.get("criteria"),
    });
  }
  return (
    <div className="page board-page">
      <section className="settings-card">
        <h2>Members</h2>
        <p className="muted">
          Membership grants no permissions. Each bot keeps its own memory and
          grants; a role here only describes its job on this board. Coordinator
          changes apply to the next run.
        </p>
        <ul className="roster">
          {board.members.map((m) => {
            const b = bot(m.botId);
            const coordinator = m.botId === board.coordinatorId;
            return (
              <li key={m.botId}>
                <Avatar
                  name={b?.name ?? "Unavailable"}
                  main={b?.template.id === "socius/main"}
                  size={32}
                />
                <div className="roster-name">
                  <strong>
                    {b?.name ?? "Unavailable bot"}
                    {coordinator && (
                      <span className="coordinator">
                        <Crown size={12} /> Coordinator
                      </span>
                    )}
                  </strong>
                  <input
                    aria-label={`Board role for ${b?.name ?? "member"}`}
                    defaultValue={m.role}
                    placeholder={b?.role ?? "Role on this board"}
                    maxLength={200}
                    disabled={archived}
                    onBlur={(e) => {
                      if (e.target.value !== m.role)
                        void act("boards/members", {
                          boardId: board.id,
                          botId: m.botId,
                          role: e.target.value,
                        });
                    }}
                  />
                </div>
                {!coordinator && (
                  <>
                    <button
                      className="text-button"
                      disabled={archived}
                      onClick={() =>
                        void act("boards/update", {
                          id: board.id,
                          coordinatorId: m.botId,
                        })
                      }
                    >
                      Make coordinator
                    </button>
                    <button
                      className="icon ghost"
                      aria-label={`Remove ${b?.name ?? "member"}`}
                      disabled={archived}
                      onClick={() =>
                        void act(
                          "boards/members",
                          { boardId: board.id, botId: m.botId },
                          "DELETE",
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        {outside.length > 0 && !archived && (
          <form
            className="add-member"
            onSubmit={(e) => {
              e.preventDefault();
              if (adding)
                void act("boards/members", {
                  boardId: board.id,
                  botId: adding,
                  role: "",
                }).then(() => setAdding(""));
            }}
          >
            <select
              aria-label="Bot to add"
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
            >
              <option value="">Add a bot…</option>
              {outside.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} — {b.role}
                </option>
              ))}
            </select>
            <button className="pill" disabled={!adding}>
              Add member
            </button>
          </form>
        )}
        {!archived && (
          <button className="text-button new-member" onClick={onCreateBot}>
            <Plus size={14} />
            Create a new bot for this board
          </button>
        )}
      </section>
      <section className="settings-card">
        <h2>Brief</h2>
        <form className="form" onSubmit={saveBrief} key={board.updatedAt}>
          <label>
            Name
            <input
              name="name"
              defaultValue={board.name}
              required
              maxLength={100}
              disabled={archived}
            />
          </label>
          <label>
            Objective
            <textarea
              name="objective"
              defaultValue={board.objective}
              required
              rows={2}
              maxLength={2000}
              disabled={archived}
            />
          </label>
          <label>
            Completion criteria
            <textarea
              name="criteria"
              defaultValue={board.completionCriteria}
              rows={2}
              maxLength={2000}
              disabled={archived}
            />
          </label>
          <button className="primary" disabled={archived}>
            Save brief
          </button>
        </form>
      </section>
      <section className="settings-card">
        <h2>How this board works</h2>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={board.reviewPlan}
            disabled={archived}
            onChange={(e) =>
              void act("boards/update", {
                id: board.id,
                reviewPlan: e.target.checked,
              })
            }
          />
          <span>
            <strong>Show me the plan before the team starts</strong>
            <small>
              The coordinator posts its plan in the thread. Reply to change it,
              or run it when it looks right.
            </small>
          </span>
        </label>
      </section>
      <section className="settings-card">
        <h2>Execution limits</h2>
        <p className="muted">
          Limits apply per run and never cap the roster. When a limit is
          reached, unstarted work stays visible so you can raise it and retry.
        </p>
        <form
          className="budget-grid"
          onSubmit={saveBudgets}
          key={board.updatedAt}
        >
          {budgetFields.map((f) => (
            <label key={f.key}>
              {f.label}
              <input
                name={f.key}
                type="number"
                min={1}
                defaultValue={board.budgets[f.key]}
                disabled={archived}
              />
              <small>{f.hint}</small>
            </label>
          ))}
          <button className="primary" disabled={archived}>
            Save limits
          </button>
        </form>
      </section>
      <section className="settings-card">
        <h2>{archived ? "Archived" : "Archive"}</h2>
        <p className="muted">
          Archived boards keep their history but cannot start runs or change.
        </p>
        <button
          className="pill"
          onClick={() =>
            void act("boards/update", { id: board.id, archived: !archived })
          }
        >
          {archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
          {archived ? "Restore board" : "Archive board"}
        </button>
      </section>
    </div>
  );
}

function Sources({ detail, act }: { detail: BoardDetail; act: Act }) {
  const upload = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(""),
    [text, setText] = useState("");
  const archived = !!detail.board.archivedAt;
  async function add(e?: FormEvent) {
    e?.preventDefault();
    if (await act("boards/sources", { boardId: detail.board.id, name, text })) {
      setName("");
      setText("");
    }
  }
  return (
    <div className="page board-page">
      <section className="settings-card">
        <h2>Shared sources</h2>
        <p className="muted">
          Only what you add here is shared, and the coordinator gives each task
          just the sources it needs. Private bot memory is never pooled.
        </p>
        {detail.sources.length === 0 && (
          <p className="muted">No sources shared yet.</p>
        )}
        <ul className="source-list">
          {detail.sources.map((s) => (
            <li key={s.id}>
              <FileText size={16} />
              <span>
                <strong>{s.name}</strong>
                <small>{s.text.length.toLocaleString()} characters</small>
              </span>
              <button
                className="icon ghost"
                aria-label={`Remove ${s.name}`}
                disabled={archived}
                onClick={() =>
                  void act(
                    "boards/sources",
                    { boardId: detail.board.id, id: s.id },
                    "DELETE",
                  )
                }
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      </section>
      {!archived && (
        <section className="settings-card">
          <h2>Add a source</h2>
          <form className="form" onSubmit={add}>
            <label>
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={200}
                placeholder="e.g. interview-notes.md"
              />
            </label>
            <label>
              Text
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                required
                rows={6}
                maxLength={200000}
                placeholder="Paste text, or upload a text file."
              />
            </label>
            <input
              ref={upload}
              type="file"
              accept=".txt,.md,.csv,.json,text/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setName(file.name);
                setText((await file.text()).slice(0, 200000));
                e.target.value = "";
              }}
            />
            <div className="save-row">
              <button
                type="button"
                className="pill"
                onClick={() => upload.current?.click()}
              >
                <Upload size={14} />
                Upload text file
              </button>
              <button className="primary" disabled={!name || !text}>
                Share source
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
