import { useEffect, useState, type FormEvent } from "react";
import type { DreamingStatus, Snapshot } from "@socius/contracts/app";
import { provider } from "@socius/contracts/providers";
import { api } from "../../api.js";
import { DreamSources } from "../../components/DreamSources.js";
import { ErrorNote } from "../../components/chrome.js";

/** Uses the existing Settings layout; dreamer controls do not redesign chat. */
export function DreamingPane({
  state,
  onRefresh,
}: {
  state: Snapshot;
  onRefresh: () => Promise<void>;
}) {
  const [status, setStatus] = useState(state.dreaming);
  const [enabled, setEnabled] = useState(state.dreaming.settings.enabled);
  const [model, setModel] = useState(
    state.dreaming.settings.model
      ? JSON.stringify(state.dreaming.settings.model)
      : "",
  );
  const [idle, setIdle] = useState(state.dreaming.settings.idleMinutes);
  const [interval, setIntervalMinutes] = useState(
    state.dreaming.settings.intervalMinutes,
  );
  const [botId, setBotId] = useState(state.bots[0]?.id ?? "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [revision, setRevision] = useState(state.dreaming.settings.revision);
  const [pollError, setPollError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let mounted = true;
    const timer = setInterval(() => {
      void api<DreamingStatus>("dreaming")
        .then((s) => {
          if (mounted) {
            setStatus(s);
            setPollError("");
          }
        })
        .catch(() => {
          if (mounted)
            setPollError(
              "Dreaming status could not refresh. Reopen Settings to reconnect.",
            );
        });
    }, 2000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);
  const selected = state.models.find(
    (m) =>
      JSON.stringify({ connectionId: m.connectionId, modelId: m.modelId }) ===
      model,
  );
  const connection = state.connections.find(
    (c) => c.id === selected?.connectionId,
  );
  const active = status.runs.find(
    (r) => r.state === "running" || r.state === "committing",
  );
  async function perform(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setStatus(await api<DreamingStatus>("dreaming"));
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function save(e: FormEvent) {
    e.preventDefault();
    void perform(async () => {
      const updated = await api<DreamingStatus>("dreaming/settings", {
        expectedRevision: revision,
        enabled,
        model: model ? JSON.parse(model) : null,
        idleMinutes: idle,
        intervalMinutes: interval,
      });
      setRevision(updated.settings.revision);
      setNotice("Dreaming settings saved.");
    });
  }
  return (
    <>
      <header className="pane-head">
        <h3>Dreaming</h3>
        <p>Let your bots remember useful things while you are away.</p>
      </header>
      <form className="form" onSubmit={save}>
        <div className="pane-section">
          <label>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />{" "}
            Enable background dreaming
          </label>
          <p className="muted">
            When enabled, Socius reviews completed direct chats, including
            earlier conversations, and automatically saves useful facts in each
            bot’s private memory. You can edit or delete them in Memory. Groups
            and attached documents are excluded.
          </p>
          <label>
            Dreaming model
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              required={enabled}
            >
              <option value="">Choose a model</option>
              {model && !selected && (
                <option value={model}>
                  Selected model unavailable — choose another
                </option>
              )}
              {state.models.map((m) => (
                <option
                  key={`${m.connectionId}/${m.modelId}`}
                  value={JSON.stringify({
                    connectionId: m.connectionId,
                    modelId: m.modelId,
                  })}
                >
                  {m.label} ·{" "}
                  {
                    state.connections.find((c) => c.id === m.connectionId)
                      ?.label
                  }
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            Separate from your chat model. No automatic fallback.
          </p>
          {connection && (
            <p className="privacy-note">
              {provider(connection.provider).destination === "local"
                ? `Direct-chat excerpts and private memories go to ${connection.label} on this computer.`
                : provider(connection.provider).destination === "endpoint"
                  ? `Direct-chat excerpts and private memories go to your configured ${connection.label} endpoint. It is local only if hosted on this computer.`
                  : `Direct-chat excerpts and private memories are sent to ${connection.label}. Provider usage charges may apply.`}
            </p>
          )}
          <label>
            Start after idle minutes
            <input
              type="number"
              min={1}
              max={60}
              required
              value={idle}
              onChange={(e) => setIdle(e.target.valueAsNumber)}
            />
          </label>
          <label>
            Minutes between dreams per bot
            <input
              type="number"
              min={15}
              max={1440}
              required
              value={interval}
              onChange={(e) => setIntervalMinutes(e.target.valueAsNumber)}
            />
          </label>
          <p className="muted">
            Runs while Socius is open and this computer is awake. Chatting
            pauses dreaming. Bots need memory access. Dreaming cannot use tools
            or take external actions.
          </p>
          <ErrorNote error={error || pollError} />
          {status.settings.revision !== revision && (
            <p role="alert">
              Settings changed elsewhere. Reopen Settings before saving.
            </p>
          )}
          <p role="status">{notice}</p>
          <button className="primary" disabled={busy}>
            Save dreaming settings
          </button>
        </div>
      </form>
      <div className="pane-section">
        <h4>Dream now</h4>
        <p className="muted">
          {!status.settings.enabled
            ? "Dreaming is off."
            : !status.modelAvailable
              ? "The saved dreaming model is unavailable. Choose another and save."
              : active
                ? "Dreaming is working in the background."
                : "Ready for the next quiet moment."}
        </p>
        <label>
          Bot to dream for
          <select value={botId} onChange={(e) => setBotId(e.target.value)}>
            {state.bots.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <div className="modal-actions">
          <button
            disabled={
              busy ||
              !!active ||
              !status.settings.enabled ||
              !status.modelAvailable ||
              !botId
            }
            onClick={() => void perform(() => api("dreaming/run", { botId }))}
          >
            Dream now
          </button>
          {active?.state === "running" && (
            <button
              disabled={busy}
              onClick={() =>
                void perform(() => api("dreaming/cancel", { id: active.id }))
              }
            >
              Stop dreaming
            </button>
          )}
        </div>
      </div>
      <div className="pane-section">
        <h4>Recent dreams</h4>
        {!status.runs.length && (
          <p className="muted">
            No dreams yet. Finish a direct chat, then let Socius settle.
          </p>
        )}
        {status.runs.map((r) => (
          <article className="pane-section" key={r.id}>
            <strong>
              {state.bots.find((b) => b.id === r.botId)?.name ?? "Deleted bot"}{" "}
              · {r.state}
            </strong>
            <p className="muted">
              {new Date(r.createdAt).toLocaleString()} · {r.model.modelId} ·{" "}
              {r.sourceMessageIds.length} sources · {r.saved} saved
              {r.skipped ? ` · ${r.skipped} excluded` : ""}
            </p>
            {r.error && <p>{r.error}</p>}
            {r.sourceMessageIds.length > 0 && (
              <DreamSources botId={r.botId} runId={r.id} />
            )}
          </article>
        ))}
      </div>
    </>
  );
}
