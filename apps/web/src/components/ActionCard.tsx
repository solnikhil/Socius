import { useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Check, ExternalLink, RefreshCw } from "lucide-react";
import type { ActionRecord, Snapshot } from "@socius/contracts/app";
import { api } from "../api.js";
import { AppIcon } from "./AppIcon.js";
import { ErrorNote, Markdown } from "./chrome.js";

/** Fields that carry the body of a change; shown as readable text. */
const PROSE = /^(content|description|body|text|message|markdown)$/i;
/** Internal references the user never needs to read. */
const OPAQUE =
  /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$|^[0-9a-f]{24,}$/i;
/** Drops raw IDs (and the "under"/"in" that introduces them) from a summary. */
const readable = (summary: string) =>
  summary
    .replace(
      /\s+(?:under|in|on|to|from)\s+[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/gi,
      "",
    )
    .replace(
      /\s*\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/gi,
      "",
    )
    .trim();
const label = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase());

/** What happened, in one line, once the user has decided. */
const outcome: Partial<Record<ActionRecord["state"], string>> = {
  executing: "Working on it…",
  succeeded: "Done",
  denied: "Declined",
  expired: "This request expired",
  blocked: "Blocked",
  failed: "Didn't go through",
  unknown: "Not sure it went through",
};

/**
 * A connected-app change waiting for the user, laid out as a question with
 * lettered answers. Approval covers exactly these details; a typed answer
 * declines and goes back to the bot so it can adjust.
 */
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
    [error, setError] = useState(""),
    [reply, setReply] = useState(""),
    [expanded, setExpanded] = useState(false);
  const app =
    state.releases.find((r) => r.manifest.id === a.release.id)?.manifest.name ??
    "the app";
  const bot = state.bots.find((b) => b.id === a.actor.botId)?.name ?? "A bot";
  const open = a.state === "pending" && Date.parse(a.expiresAt) > Date.now();
  const summary = readable(a.summary);
  async function run(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, body);
      setReply("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      await onRefresh();
      setBusy(false);
    }
  }
  const decide = (approve: boolean, feedback?: string) =>
    void run("actions/resolve", {
      id: a.id,
      digest: a.digest,
      approve,
      ...(feedback ? { feedback } : {}),
    }).then(() =>
      // Answered: hand the keyboard back to the message box.
      document
        .querySelector<HTMLTextAreaElement>(".composer textarea")
        ?.focus({ preventScroll: true }),
    );
  function answer(e: FormEvent) {
    e.preventDefault();
    if (reply.trim()) decide(false, reply.trim());
  }
  function keys(e: KeyboardEvent<HTMLDivElement>) {
    if (!open || busy || e.target instanceof HTMLInputElement) return;
    const key = e.key.toLowerCase();
    if (key === "a") decide(true);
    else if (key === "b") decide(false);
  }
  // Show what matters: titles are already in the question, IDs are noise.
  const entries = Object.entries(a.arguments)
    .map(([key, value]) => [key, String(value ?? "")] as const)
    .filter(([, value]) => value && !OPAQUE.test(value.trim()));
  const prose = entries.filter(
    ([key, value]) => PROSE.test(key) || value.length > 160,
  );
  const details = entries.filter(
    ([key, value]) =>
      !prose.some(([k]) => k === key) && !a.summary.includes(value),
  );
  const long = prose.some(
    ([, v]) => v.length > 360 || v.split("\n").length > 6,
  );
  return (
    <div
      className={`decision-card action-card state-${a.state}`}
      data-action={a.id}
      tabIndex={open ? 0 : -1}
      onKeyDown={keys}
      aria-label={open ? `${summary}? Needs your approval` : summary}
    >
      <div className="decision-head">
        <AppIcon
          item={{ id: a.release.id, name: app, kind: "connector" }}
          size={22}
        />
        <strong>{open ? `${summary}?` : summary}</strong>
      </div>
      {(details.length > 0 || prose.length > 0) && (
        <div className="decision-details">
          {details.map(([key, value]) => (
            <p key={key} className="decision-field">
              <span>{label(key)}</span> {value}
            </p>
          ))}
          {prose.map(([key, value]) => (
            <div
              key={key}
              className={`decision-prose ${long && !expanded ? "clamped" : ""}`}
            >
              <Markdown text={value} />
            </div>
          ))}
          {long && (
            <button
              type="button"
              className="text-button"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Show less" : "Show all"}
            </button>
          )}
        </div>
      )}
      {open ? (
        <>
          <div className="decision-options" role="group" aria-label="Answer">
            <button type="button" disabled={busy} onClick={() => decide(true)}>
              <kbd>A</kbd> Yes, go ahead
            </button>
            <button type="button" disabled={busy} onClick={() => decide(false)}>
              <kbd>B</kbd> No, don't
            </button>
          </div>
          <form className="decision-reply" onSubmit={answer}>
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Type your own answer"
              aria-label={`Reply to ${bot} instead`}
              maxLength={2000}
              disabled={busy}
            />
            {reply.trim() && (
              <button className="icon" aria-label="Send answer" disabled={busy}>
                <ArrowUp size={15} />
              </button>
            )}
          </form>
          <p className="decision-meta">
            {bot} is waiting · {app} changes only after you approve
          </p>
        </>
      ) : (
        <div className="decision-outcome">
          {a.state === "succeeded" && <Check size={15} />}
          <span>
            {a.state === "pending" ? outcome.expired : outcome[a.state]}
            {a.state === "succeeded" && a.result?.summary
              ? ` · ${a.result.summary}`
              : ""}
            {a.state === "denied" && a.feedback
              ? ` · you replied “${a.feedback}”`
              : ""}
          </span>
          {a.result?.url && (
            <a href={a.result.url} target="_blank" rel="noreferrer noopener">
              Open <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}
      {a.error && a.state !== "succeeded" && (
        <p className="decision-error">{a.error}</p>
      )}
      <ErrorNote error={error} />
      {(a.state === "unknown" || (a.state === "failed" && a.retryable)) && (
        <div className="modal-actions">
          {a.state === "unknown" && (
            <button
              disabled={busy}
              onClick={() => void run("actions/check", { id: a.id })}
            >
              <RefreshCw size={14} />
              Check again
            </button>
          )}
          {a.retryable && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => void run("actions/retry", { id: a.id })}
            >
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Actions a person still has to look at: pending, unclear or retryable. */
export const needsAttention = (a: ActionRecord) =>
  (a.state === "pending" && Date.parse(a.expiresAt) > Date.now()) ||
  a.state === "unknown" ||
  (a.state === "failed" && a.retryable);
