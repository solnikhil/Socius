import { useState } from "react";
import { Check, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import type { ActionRecord, Snapshot } from "@socius/contracts/app";
import { api } from "../api.js";
import { ErrorNote } from "./chrome.js";

const heading: Record<ActionRecord["state"], string> = {
  pending: "Review a change",
  denied: "Change declined",
  expired: "Approval expired",
  blocked: "Change blocked",
  executing: "Making the change…",
  succeeded: "Change made",
  failed: "Change not made",
  unknown: "Outcome needs checking",
};

const argLabel: Record<string, string> = {
  parentPage: "Parent page",
  title: "Title",
  content: "Content",
  page: "Page",
  query: "Search",
};

/** Exact external write proposal: the user approves these arguments and nothing else. */
export function ActionCard({
  action: a,
  state,
  onRefresh,
}: {
  action: ActionRecord;
  state: Snapshot;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const bot = state.bots.find((b) => b.id === a.actor.botId);
  const expired = a.state === "pending" && Date.parse(a.expiresAt) < Date.now();
  async function run(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      await onRefresh();
      setBusy(false);
    }
  }
  const args = a.arguments as Record<string, string>;
  return (
    <div className={`approval-card action-card state-${a.state}`}>
      <div className="approval-heading">
        <ShieldCheck size={18} />
        <strong>{expired ? heading.expired : heading[a.state]}</strong>
        <span>
          {a.state === "pending" && !expired
            ? `Needs your approval · expires ${new Date(a.expiresAt).toLocaleString()}`
            : new Date(a.updatedAt).toLocaleString()}
        </span>
      </div>
      <p>{a.summary}</p>
      <dl className="action-args">
        {Object.entries(args).map(([key, value]) => (
          <div key={key}>
            <dt>{argLabel[key] ?? key}</dt>
            <dd>
              {String(value).length > 160 || String(value).includes("\n") ? (
                <pre>{String(value)}</pre>
              ) : (
                String(value)
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className="action-meta">
        Requested by {bot?.name ?? "a bot"}
        {a.actor.boardId ? ` on board ${a.actor.boardId}` : ""} · {a.release.id}{" "}
        {a.release.version} · {a.capability}
      </p>
      {a.result && (
        <p className="action-result">
          <Check size={14} /> {a.result.summary}{" "}
          {a.result.url && (
            <a href={a.result.url} target="_blank" rel="noreferrer noopener">
              Open <ExternalLink size={12} />
            </a>
          )}
        </p>
      )}
      {a.error && <p className="action-error">{a.error}</p>}
      <ErrorNote error={error} />
      <div className="modal-actions">
        {a.state === "pending" && !expired && (
          <>
            <button
              disabled={busy}
              onClick={() =>
                void run("actions/resolve", {
                  id: a.id,
                  digest: a.digest,
                  approve: false,
                })
              }
            >
              Decline
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void run("actions/resolve", {
                  id: a.id,
                  digest: a.digest,
                  approve: true,
                })
              }
            >
              <Check size={15} />
              Approve this change
            </button>
          </>
        )}
        {a.state === "unknown" && (
          <button
            disabled={busy}
            onClick={() => void run("actions/check", { id: a.id })}
          >
            <RefreshCw size={14} />
            Check again
          </button>
        )}
        {(a.state === "failed" || a.state === "unknown") && a.retryable && (
          <button
            className="primary"
            disabled={busy}
            onClick={() => void run("actions/retry", { id: a.id })}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

/** Actions a person still has to look at: pending, unclear or retryable. */
export const needsAttention = (a: ActionRecord) =>
  (a.state === "pending" && Date.parse(a.expiresAt) > Date.now()) ||
  a.state === "unknown" ||
  (a.state === "failed" && a.retryable);
