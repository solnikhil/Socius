import {
  useEffect,
  useState,
  type FormEvent,
  type MutableRefObject,
} from "react";
import {
  ArrowLeft,
  Boxes,
  Check,
  CircleAlert,
  ExternalLink,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { Snapshot } from "@socius/contracts/app";
import {
  PROVIDERS,
  provider,
  type ProviderCategory,
  type ProviderConnection,
  type ProviderDescriptor,
  type ProviderId,
} from "@socius/contracts/providers";
import { api } from "../../api.js";
import { ErrorNote } from "../../components/chrome.js";
import { ProviderMark } from "../../components/ProviderMark.js";
import { destinationNote, type OpenSettings } from "../../models.js";

type View =
  | { kind: "list" }
  | { kind: "form"; provider: ProviderId; connection?: ProviderConnection };

const groups: { id: ProviderCategory; title: string }[] = [
  { id: "local", title: "On this computer" },
  { id: "cloud", title: "Cloud providers" },
  { id: "gateway", title: "Gateways" },
  { id: "enterprise", title: "Enterprise clouds" },
  { id: "custom", title: "Custom" },
];

export function ProvidersPane({
  state,
  onRefresh,
  onNavigate,
  backRef,
}: {
  state: Snapshot;
  onRefresh: () => Promise<void>;
  onNavigate: OpenSettings;
  backRef: MutableRefObject<(() => void) | null>;
}) {
  const [view, setView] = useState<View>({ kind: "list" });
  useEffect(() => {
    backRef.current =
      view.kind === "list" ? null : () => setView({ kind: "list" });
  }, [view, backRef]);
  if (view.kind === "form")
    return (
      <ConnectionForm
        descriptor={provider(view.provider)}
        connection={view.connection}
        secretStorage={state.secretStorage}
        envFields={state.environment[view.provider] ?? []}
        onBack={() => setView({ kind: "list" })}
        onSaved={async (c, created) => {
          await onRefresh();
          if (created) onNavigate("models", c.id);
          else setView({ kind: "list" });
        }}
      />
    );
  return (
    <>
      <header className="pane-head">
        <h3>Providers</h3>
        <p>
          Connect the services and local servers your bots can use. You can
          connect several, including more than one account per provider.
        </p>
      </header>
      {state.connections.length > 0 && (
        <div className="pane-section">
          <h4>Connected</h4>
          <div className="connection-list">
            {state.connections.map((c) => (
              <ConnectionCard
                key={c.id}
                connection={c}
                state={state}
                onRefresh={onRefresh}
                onEdit={() =>
                  setView({ kind: "form", provider: c.provider, connection: c })
                }
                onModels={() => onNavigate("models", c.id)}
              />
            ))}
          </div>
        </div>
      )}
      <ProviderPicker
        onPick={(id) => setView({ kind: "form", provider: id })}
        connected={new Set(state.connections.map((c) => c.provider))}
      />
    </>
  );
}

function ProviderPicker({
  onPick,
  connected,
}: {
  onPick: (id: ProviderId) => void;
  connected: Set<ProviderId>;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = PROVIDERS.filter((p) =>
    `${p.name} ${p.description} ${p.id}`.toLowerCase().includes(q),
  );
  return (
    <div className="pane-section">
      <div className="section-row">
        <h4>Add a provider</h4>
        <label className="search compact">
          <Search size={15} />
          <input
            aria-label="Search providers"
            placeholder="Search providers"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {groups.map((g) => {
        const items = matches.filter((p) => p.category === g.id);
        return (
          items.length > 0 && (
            <div className="provider-group" key={g.id}>
              <h5>{g.title}</h5>
              <div className="provider-grid">
                {items.map((p) => (
                  <button
                    key={p.id}
                    className="provider-tile"
                    aria-label={`Add ${p.name}`}
                    onClick={() => onPick(p.id)}
                  >
                    <ProviderMark id={p.id} size={30} />
                    <span>
                      <strong>
                        {p.name}
                        {connected.has(p.id) && (
                          <Check size={13} aria-label="Connected" />
                        )}
                      </strong>
                      <small>{p.description}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )
        );
      })}
      {matches.length === 0 && (
        <p className="muted">
          No provider matches. Most other services work with the
          OpenAI-compatible option.
        </p>
      )}
    </div>
  );
}

function StatusLine({ connection }: { connection: ProviderConnection }) {
  const s = connection.status;
  if (!s) return <span className="status idle">Not tested yet</span>;
  return (
    <span className={`status ${s.ok ? "ok" : "bad"}`}>
      {s.ok ? <Check size={13} /> : <CircleAlert size={13} />}
      {s.message}
    </span>
  );
}

function ConnectionCard({
  connection: c,
  state,
  onRefresh,
  onEdit,
  onModels,
}: {
  connection: ProviderConnection;
  state: Snapshot;
  onRefresh: () => Promise<void>;
  onEdit: () => void;
  onModels: () => void;
}) {
  const d = provider(c.provider);
  const [busy, setBusy] = useState<"" | "test" | "remove">(""),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState("");
  const models = state.models.filter((m) => m.connectionId === c.id);
  async function test() {
    setBusy("test");
    setError("");
    try {
      await api("providers/test", { id: c.id });
    } catch (e) {
      // The classified failure is also saved as the connection status.
      if (!(e as { code?: string }).code) setError((e as Error).message);
    } finally {
      await onRefresh();
      setBusy("");
    }
  }
  async function remove() {
    setBusy("remove");
    try {
      await api("providers", { id: c.id }, "DELETE");
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy("");
    }
  }
  return (
    <article className="connection-card" aria-label={`${c.label} connection`}>
      <ProviderMark id={c.provider} size={36} />
      <div className="connection-main">
        <div className="connection-title">
          <strong>{c.label}</strong>
          {c.label !== d.name && <small>{d.name}</small>}
        </div>
        <StatusLine connection={c} />
        <small className="connection-meta">
          {models.length} model{models.length === 1 ? "" : "s"} added
          {c.config.baseURL ? ` · ${c.config.baseURL}` : ""}
          {c.env.length > 0 ? " · uses environment credentials" : ""}
        </small>
        <ErrorNote error={error} />
      </div>
      <div className="connection-actions">
        <button
          className="pill"
          onClick={() => void test()}
          disabled={!!busy}
          title={
            d.discovery
              ? "Check credentials by listing models"
              : "Check credentials with a short request to an added model"
          }
        >
          {busy === "test" ? (
            <Loader2 size={14} className="spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          Test
        </button>
        <button className="pill" onClick={onModels}>
          <Boxes size={14} />
          Models
        </button>
        <button
          className="icon ghost"
          aria-label={`Edit ${c.label}`}
          onClick={onEdit}
        >
          <Pencil size={15} />
        </button>
        {confirm ? (
          <button
            className="danger pill"
            disabled={!!busy}
            onClick={() => void remove()}
          >
            Remove, and its models
          </button>
        ) : (
          <button
            className="icon ghost"
            aria-label={`Remove ${c.label}`}
            onClick={() => setConfirm(true)}
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </article>
  );
}

function ConnectionForm({
  descriptor: d,
  connection,
  secretStorage,
  envFields,
  onBack,
  onSaved,
}: {
  descriptor: ProviderDescriptor;
  connection?: ProviderConnection | undefined;
  secretStorage: boolean;
  envFields: string[];
  onBack: () => void;
  onSaved: (c: ProviderConnection, created: boolean) => Promise<void>;
}) {
  const [label, setLabel] = useState(connection?.label ?? d.name),
    [config, setConfig] = useState<Record<string, string>>(() =>
      Object.fromEntries(
        d.fields
          .filter((f) => f.kind !== "secret")
          .map((f) => [f.key, connection?.config[f.key] ?? f.default ?? ""]),
      ),
    ),
    [secrets, setSecrets] = useState<Record<string, string>>({}),
    [cleared, setCleared] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const saved = new Set(connection?.secrets ?? []),
    env = new Set(connection?.env ?? envFields);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const filled = (o: Record<string, string>) =>
      Object.fromEntries(Object.entries(o).filter(([, v]) => v.trim()));
    try {
      const result = connection
        ? await api<ProviderConnection>("providers/update", {
            id: connection.id,
            label,
            config: filled(config),
            secrets: {
              ...Object.fromEntries(cleared.map((k) => [k, null])),
              ...filled(secrets),
            },
          })
        : await api<ProviderConnection>("providers", {
            provider: d.id,
            label,
            config: filled(config),
            secrets: filled(secrets),
          });
      await onSaved(result, !connection);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <form className="form connection-form" onSubmit={submit}>
      <button type="button" className="text-button back" onClick={onBack}>
        <ArrowLeft size={14} />
        Providers
      </button>
      <header className="pane-head with-mark">
        <ProviderMark id={d.id} size={40} />
        <div>
          <h3>
            {connection ? `Edit ${connection.label}` : `Connect ${d.name}`}
          </h3>
          <p>
            {d.description}{" "}
            <a href={d.docsURL} target="_blank" rel="noreferrer">
              Setup guide
              <ExternalLink size={12} />
            </a>
            {d.keyURL && (
              <>
                {" · "}
                <a href={d.keyURL} target="_blank" rel="noreferrer">
                  Get credentials
                  <ExternalLink size={12} />
                </a>
              </>
            )}
          </p>
        </div>
      </header>
      <label>
        Name
        <input
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
        />
        <small>
          Shown in model lists. Useful when you connect several accounts.
        </small>
      </label>
      {d.fields.map((f) => {
        if (f.kind !== "secret")
          return (
            <label key={f.key}>
              {f.label}
              {!f.required && <span className="optional"> · optional</span>}
              <input
                type={f.kind === "url" ? "url" : "text"}
                required={!!f.required && !(f.env && env.has(f.key))}
                placeholder={f.placeholder ?? (f.env ? `Or set ${f.env}` : "")}
                value={config[f.key] ?? ""}
                spellCheck={false}
                autoComplete="off"
                onChange={(e) =>
                  setConfig({ ...config, [f.key]: e.target.value })
                }
              />
              {f.help && <small>{f.help}</small>}
            </label>
          );
        const isSaved = saved.has(f.key) && !cleared.includes(f.key);
        return (
          <label key={f.key}>
            {f.label}
            {!f.required && <span className="optional"> · optional</span>}
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              disabled={!secretStorage}
              required={
                !!f.required && secretStorage && !isSaved && !env.has(f.key)
              }
              placeholder={
                isSaved
                  ? "Saved. Leave blank to keep it."
                  : env.has(f.key)
                    ? `Using ${f.env} from the environment`
                    : f.env
                      ? `Paste your key, or set ${f.env}`
                      : ""
              }
              value={secrets[f.key] ?? ""}
              onChange={(e) =>
                setSecrets({ ...secrets, [f.key]: e.target.value })
              }
            />
            <small>
              {!secretStorage
                ? `This browser session cannot store keys. Set ${f.env ?? "the key"} where Socius runs.`
                : (f.help ??
                  "Encrypted by your operating system. Never shown again.")}
              {isSaved && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="text-button inline"
                    onClick={() => setCleared([...cleared, f.key])}
                  >
                    Remove saved {f.label.toLowerCase()}
                  </button>
                </>
              )}
            </small>
          </label>
        );
      })}
      <div className="privacy-note">
        <ShieldCheck size={17} />
        <span>{destinationNote(d)}</span>
      </div>
      <ErrorNote error={error} />
      <div className="save-row">
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : connection ? "Save changes" : "Save connection"}
          <Check size={16} />
        </button>
        <button type="button" onClick={onBack}>
          Cancel
        </button>
      </div>
    </form>
  );
}
