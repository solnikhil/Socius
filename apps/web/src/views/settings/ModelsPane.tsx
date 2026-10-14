import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type MutableRefObject,
} from "react";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  Wrench,
} from "lucide-react";
import type { Snapshot } from "@socius/contracts/app";
import {
  provider,
  type DiscoveredModel,
  type DiscoveryResult,
  type ModelEntry,
  type ProviderConnection,
} from "@socius/contracts/providers";
import { api } from "../../api.js";
import { Avatar, ErrorNote, MAIN_BOT_TEMPLATE } from "../../components/ui.js";
import { ProviderMark } from "../../components/ProviderMark.js";
import { modelKey, sameModel, type OpenSettings } from "../../models.js";

export function ModelsPane({
  state,
  onRefresh,
  focus,
  onNavigate,
  backRef,
}: {
  state: Snapshot;
  onRefresh: () => Promise<void>;
  focus?: string | undefined;
  onNavigate: OpenSettings;
  backRef: MutableRefObject<(() => void) | null>;
}) {
  const [adding, setAdding] = useState<string | null>(
    focus && state.connections.some((c) => c.id === focus) ? focus : null,
  );
  const [error, setError] = useState("");
  useEffect(() => {
    backRef.current = adding ? () => setAdding(null) : null;
  }, [adding, backRef]);
  const connection = adding && state.connections.find((c) => c.id === adding);
  if (connection)
    return (
      <AddModels
        connection={connection}
        state={state}
        onRefresh={onRefresh}
        onBack={() => setAdding(null)}
      />
    );
  if (!state.connections.length)
    return (
      <>
        <header className="pane-head">
          <h3>Models</h3>
          <p>Choose which models your bots use.</p>
        </header>
        <div className="empty">
          <h2>No providers connected</h2>
          <p>
            Connect a local server or a cloud provider, then add its models
            here.
          </p>
          <button className="primary" onClick={() => onNavigate("providers")}>
            Connect a provider
          </button>
        </div>
      </>
    );
  async function select(entry: ModelEntry | null, botId: string | null = null) {
    setError("");
    try {
      await api("models/select", {
        botId,
        model: entry && {
          connectionId: entry.connectionId,
          modelId: entry.modelId,
        },
      });
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const defaultEntry = state.models.find((m) =>
    sameModel(state.selection.default, m),
  );
  return (
    <>
      <header className="pane-head">
        <h3>Models</h3>
        <p>
          Add models from your providers. Every bot uses the default unless you
          give it its own model below or from its chat.
        </p>
      </header>
      <div className="pane-section">
        <h4>Default model</h4>
        {state.models.length ? (
          <label className="field-inline">
            <span className="sr-only">Default model</span>
            <select
              aria-label="Default model"
              value={defaultEntry ? modelKey(defaultEntry) : ""}
              onChange={(e) =>
                void select(
                  state.models.find((m) => modelKey(m) === e.target.value) ??
                    null,
                )
              }
            >
              {!defaultEntry && <option value="">Choose a model</option>}
              <ModelOptions state={state} />
            </select>
          </label>
        ) : (
          <p className="muted">Add a model below to choose a default.</p>
        )}
        <ErrorNote error={error} />
      </div>
      {state.models.length > 0 && (
        <BotModels
          state={state}
          defaultLabel={defaultEntry?.label}
          onSelect={(m, botId) => void select(m, botId)}
        />
      )}
      {state.connections.map((c) => (
        <ConnectionModels
          key={c.id}
          connection={c}
          state={state}
          onRefresh={onRefresh}
          onAdd={() => setAdding(c.id)}
          onSetDefault={(m) => void select(m)}
        />
      ))}
    </>
  );
}

function ModelOptions({ state }: { state: Snapshot }) {
  return state.connections.map((c) => (
    <optgroup key={c.id} label={c.label}>
      {state.models
        .filter((m) => m.connectionId === c.id)
        .map((m) => (
          <option key={modelKey(m)} value={modelKey(m)}>
            {m.label}
          </option>
        ))}
    </optgroup>
  ));
}

// Each bot can override the workspace default; group-chat members reply with
// their own model too.
function BotModels({
  state,
  defaultLabel,
  onSelect,
}: {
  state: Snapshot;
  defaultLabel: string | undefined;
  onSelect: (m: ModelEntry | null, botId: string) => void;
}) {
  const bots = [...state.bots].sort(
    (a, b) =>
      Number(b.template.id === MAIN_BOT_TEMPLATE) -
      Number(a.template.id === MAIN_BOT_TEMPLATE),
  );
  return (
    <div className="pane-section">
      <h4>Bots</h4>
      <ul className="bot-model-list">
        {bots.map((b) => {
          const override = state.selection.bots[b.id];
          const entry =
            override && state.models.find((m) => sameModel(override, m));
          return (
            <li key={b.id}>
              <Avatar
                name={b.name}
                main={b.template.id === MAIN_BOT_TEMPLATE}
                size={28}
              />
              <span className="bot-model-name">
                <strong>{b.name}</strong>
                <small>{b.role}</small>
              </span>
              <select
                aria-label={`Model for ${b.name}`}
                value={entry ? modelKey(entry) : ""}
                onChange={(e) =>
                  onSelect(
                    state.models.find((m) => modelKey(m) === e.target.value) ??
                      null,
                    b.id,
                  )
                }
              >
                <option value="">
                  {defaultLabel ? `Default · ${defaultLabel}` : "Default"}
                </option>
                <ModelOptions state={state} />
              </select>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ConnectionModels({
  connection: c,
  state,
  onRefresh,
  onAdd,
  onSetDefault,
}: {
  connection: ProviderConnection;
  state: Snapshot;
  onRefresh: () => Promise<void>;
  onAdd: () => void;
  onSetDefault: (m: ModelEntry) => void;
}) {
  const models = state.models.filter((m) => m.connectionId === c.id);
  const d = provider(c.provider);
  return (
    <div className="pane-section">
      <div className="section-row">
        <h4 className="with-mark">
          <ProviderMark id={c.provider} size={22} />
          {c.label}
          {c.label !== d.name && <small>{d.name}</small>}
        </h4>
        <button
          className="pill"
          onClick={onAdd}
          aria-label={`Add models from ${c.label}`}
        >
          <Plus size={14} />
          Add models
        </button>
      </div>
      {models.length === 0 ? (
        <p className="muted">No models added from this provider yet.</p>
      ) : (
        <div className="model-list">
          {models.map((m) => (
            <ModelRow
              key={modelKey(m)}
              entry={m}
              isDefault={sameModel(state.selection.default, m)}
              botCount={
                Object.values(state.selection.bots).filter((r) =>
                  sameModel(r, m),
                ).length
              }
              onRefresh={onRefresh}
              onSetDefault={() => onSetDefault(m)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolsBadge({ tools }: { tools: boolean | null | undefined }) {
  if (tools === true)
    return (
      <span
        className="badge good"
        title="Can call tools: bot proposals and memory work"
      >
        <Wrench size={11} />
        Tools
      </span>
    );
  if (tools === false)
    return (
      <span
        className="badge warn"
        title="Runs without tools: no bot proposals or memory"
      >
        No tools
      </span>
    );
  return null;
}

function ModelRow({
  entry: m,
  isDefault,
  botCount,
  onRefresh,
  onSetDefault,
}: {
  entry: ModelEntry;
  isDefault: boolean;
  botCount: number;
  onRefresh: () => Promise<void>;
  onSetDefault: () => void;
}) {
  const [busy, setBusy] = useState<"" | "test" | "remove">(""),
    [error, setError] = useState("");
  const ref = { connectionId: m.connectionId, modelId: m.modelId };
  async function run(kind: "test" | "remove") {
    setBusy(kind);
    setError("");
    try {
      if (kind === "test") await api("models/test", ref);
      else await api("models", ref, "DELETE");
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <article className="model-row" aria-label={m.label}>
      <div className="model-main">
        <div className="model-title">
          <strong>{m.label}</strong>
          {isDefault && (
            <span className="badge accent">
              <Star size={11} fill="currentColor" />
              Default
            </span>
          )}
          <ToolsBadge tools={m.tools} />
          {botCount > 0 && (
            <span className="badge">
              {botCount} bot{botCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {m.label !== m.modelId && <code>{m.modelId}</code>}
        {m.check && (
          <span className={`status ${m.check.ok ? "ok" : "bad"}`}>
            {m.check.ok ? <Check size={13} /> : <CircleAlert size={13} />}
            {m.check.message}
            {m.check.latencyMs
              ? ` · ${(m.check.latencyMs / 1000).toFixed(1)}s`
              : ""}
          </span>
        )}
        <ErrorNote error={error} />
      </div>
      <div className="model-actions">
        <button
          className="pill"
          disabled={!!busy}
          onClick={() => void run("test")}
          title="Send a short message and a tool-call check"
        >
          {busy === "test" ? (
            <Loader2 size={14} className="spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          Test
        </button>
        {!isDefault && (
          <button className="pill" onClick={onSetDefault}>
            Make default
          </button>
        )}
        <button
          className="icon ghost"
          aria-label={`Remove ${m.label}`}
          disabled={!!busy}
          onClick={() => void run("remove")}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  );
}

function AddModels({
  connection: c,
  state,
  onRefresh,
  onBack,
}: {
  connection: ProviderConnection;
  state: Snapshot;
  onRefresh: () => Promise<void>;
  onBack: () => void;
}) {
  const d = provider(c.provider);
  const [list, setList] = useState<DiscoveryResult | null>(null),
    [loading, setLoading] = useState(d.discovery),
    [listError, setListError] = useState(""),
    [query, setQuery] = useState(""),
    [manual, setManual] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState("");
  const load = useCallback(
    async (refresh: boolean) => {
      if (!d.discovery) return;
      setLoading(true);
      setListError("");
      try {
        setList(
          await api<DiscoveryResult>(
            `providers/models?id=${encodeURIComponent(c.id)}${refresh ? "&refresh=1" : ""}`,
          ),
        );
      } catch (e) {
        setListError((e as Error).message);
      } finally {
        setLoading(false);
        void onRefresh();
      }
    },
    // Loads once per connection; onRefresh only syncs the snapshot afterwards.
    [c.id, d.discovery],
  );
  useEffect(() => {
    void load(false);
  }, [load]);
  const added = new Set(
    state.models.filter((m) => m.connectionId === c.id).map((m) => m.modelId),
  );
  async function add(modelId: string, label?: string) {
    setPending(modelId);
    setError("");
    try {
      await api("models", {
        connectionId: c.id,
        modelId,
        ...(label ? { label } : {}),
      });
      await onRefresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setPending("");
    }
  }
  async function submitManual(e: FormEvent) {
    e.preventDefault();
    if (manual.trim() && (await add(manual.trim()))) setManual("");
  }
  const q = query.trim().toLowerCase();
  const shown: DiscoveredModel[] =
    list?.models.filter((m) =>
      `${m.id} ${m.name ?? ""}`.toLowerCase().includes(q),
    ) ?? [];
  return (
    <>
      <button type="button" className="text-button back" onClick={onBack}>
        <ArrowLeft size={14} />
        Models
      </button>
      <header className="pane-head with-mark">
        <ProviderMark id={c.provider} size={40} />
        <div>
          <h3>Add models from {c.label}</h3>
          <p>
            {d.discovery
              ? `Models available to this ${d.name} connection.`
              : `${d.name} does not publish a model list. Enter the model ID from its console.`}
          </p>
        </div>
      </header>
      <form className="manual-model" onSubmit={submitManual}>
        <label>
          Model ID
          <input
            value={manual}
            placeholder={d.modelPlaceholder}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setManual(e.target.value)}
          />
        </label>
        <button className="primary" disabled={!manual.trim() || !!pending}>
          Add model
          <Plus size={15} />
        </button>
      </form>
      <ErrorNote error={error} />
      {d.discovery && (
        <div className="pane-section">
          <div className="section-row">
            <h4>
              Available
              {list && <small> · {list.models.length}</small>}
            </h4>
            <div className="row-tools">
              <label className="search compact">
                <Search size={15} />
                <input
                  aria-label="Filter models"
                  placeholder="Filter models"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <button
                className="icon ghost"
                aria-label="Refresh model list"
                title="Refresh model list"
                disabled={loading}
                onClick={() => void load(true)}
              >
                <RefreshCw size={15} className={loading ? "spin" : ""} />
              </button>
            </div>
          </div>
          {listError && (
            <ErrorNote
              error={`${listError} You can still enter a model ID above.`}
            />
          )}
          {loading && !list && (
            <p className="muted loading-line">
              <Loader2 size={15} className="spin" />
              Loading models…
            </p>
          )}
          {list && shown.length === 0 && (
            <p className="muted">
              {list.models.length
                ? "No models match."
                : "This connection returned no chat models."}
            </p>
          )}
          <div className="discovered-list">
            {shown.slice(0, 300).map((m) => (
              <div className="discovered-row" key={m.id}>
                <div>
                  <strong>{m.name ?? m.id}</strong>
                  {m.name && <code>{m.id}</code>}
                </div>
                <span className="discovered-meta">
                  <ToolsBadge tools={m.tools} />
                  {m.contextWindow && (
                    <span className="badge">
                      {m.contextWindow >= 1000
                        ? `${Math.round(m.contextWindow / 1000)}K`
                        : m.contextWindow}{" "}
                      context
                    </span>
                  )}
                </span>
                {added.has(m.id) ? (
                  <span className="added">
                    <Check size={14} />
                    Added
                  </span>
                ) : (
                  <button
                    className="pill"
                    aria-label={`Add ${m.id}`}
                    disabled={pending === m.id}
                    onClick={() => void add(m.id, m.name)}
                  >
                    Add
                  </button>
                )}
              </div>
            ))}
          </div>
          {shown.length > 300 && (
            <p className="muted">
              Showing 300 of {shown.length}. Filter to find more.
            </p>
          )}
        </div>
      )}
    </>
  );
}
