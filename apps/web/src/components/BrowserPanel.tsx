import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Globe,
  Hand,
  Minimize2,
  Play,
  Square,
  SquareArrowOutUpRight,
} from "lucide-react";
import type { Snapshot } from "@socius/contracts/app";
import type {
  BrowserAction,
  BrowserControlMode,
  BrowserPreview,
  BrowserSession,
} from "@socius/contracts/browser";
import { api } from "../api.js";
import { ErrorNote } from "./chrome.js";

/** The browser window is on the laptop; phones see status only. */
const remote = () => location.protocol === "https:";

/** Poll only while mounted and visible; frames never enter shared app state. */
function PagePreview({ sessionId }: { sessionId: string }) {
  const [preview, setPreview] = useState<BrowserPreview>({
    image: null,
    note: "Loading preview…",
  });
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;
    let generation = 0;
    async function refresh() {
      if (stopped || document.hidden) return;
      const current = ++generation;
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch("/api/browser/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
          signal: request.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Preview unavailable");
        const frame = (await response.json()) as BrowserPreview;
        if (!stopped && !document.hidden && current === generation)
          setPreview(frame);
      } catch {
        if (!stopped && current === generation && !request.signal.aborted)
          setPreview({
            image: null,
            note: "Preview unavailable. Open the browser to view it.",
          });
      } finally {
        if (!stopped && !document.hidden && current === generation)
          timer = setTimeout(refresh, 2000);
      }
    }
    const visibility = () => {
      generation++;
      clearTimeout(timer);
      controller?.abort();
      setPreview({ image: null, note: "Loading preview…" });
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", visibility);
    void refresh();
    return () => {
      stopped = true;
      generation++;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [sessionId]);
  return (
    <div className="browser-preview">
      {preview.image?.startsWith("data:image/jpeg;base64,") ? (
        <img
          src={preview.image}
          alt="Current browser page preview"
          draggable={false}
        />
      ) : (
        <p>{preview.note ?? "No preview available."}</p>
      )}
    </div>
  );
}

/** Who has the browser, in the words the panel shows. */
const OWNER: Record<BrowserControlMode, { label: string; tone: string }> = {
  ready: { label: "Idle", tone: "" },
  agent: { label: "Bot is browsing", tone: "accent" },
  "awaiting-approval": { label: "Waiting for your review", tone: "warn" },
  "handoff-pending": { label: "Handing control to you…", tone: "warn" },
  human: { label: "You have control", tone: "good" },
  stopped: { label: "Stopped", tone: "" },
  failed: { label: "Couldn't start", tone: "warn" },
};

/** Sessions worth showing: anything running, paused or with something to say. */
export function visibleSessions(state: Snapshot, botIds: string[]) {
  return state.browserSessions.filter(
    (s) =>
      botIds.includes(s.botId) &&
      (s.mode !== "ready" || s.tabs.length > 0 || !!s.note),
  );
}

/**
 * The control strip for one bot's browser: owner, current page and the
 * Take control / Resume / Stop / Open browser controls. Resume hands control
 * back and asks the bot to continue in this chat.
 */
export function BrowserPanel({
  session: s,
  botName,
  collapsed,
  onToggle,
  onRefresh,
  onResume,
}: {
  session: BrowserSession;
  botName: string;
  collapsed: boolean;
  onToggle: () => void;
  onRefresh: () => Promise<void>;
  onResume: (session: BrowserSession) => Promise<void>;
}) {
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const tab = s.tabs.find((t) => t.active) ?? s.tabs[0];
  const owner = OWNER[s.mode];
  // `resumed:` marks a handback for the runtime; it is not a message.
  const note = s.note?.startsWith("resumed:") ? null : s.note;
  async function run(kind: string, action: () => Promise<unknown>) {
    setBusy(kind);
    setError("");
    try {
      await action();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      await onRefresh();
      setBusy("");
    }
  }
  const post = (path: string) => () =>
    api(`browser/${path}`, { sessionId: s.id });
  async function resumeBrowser() {
    if (await run("resume", post("resume")))
      // A resumed task can wait on an approval for minutes. Keep Stop and
      // Take control available while that conversation continues.
      void onResume(s).catch((e: Error) => setError(e.message));
  }
  return (
    <section className="browser-panel" aria-label={`${botName}'s browser`}>
      <div className="browser-panel-row">
        <Globe size={15} aria-hidden />
        <strong>{botName}'s browser</strong>
        <span className={`badge ${owner.tone}`} role="status">
          {owner.label}
        </span>
        <button
          className="icon ghost tiny"
          aria-label={
            collapsed ? "Expand browser preview" : "Collapse browser preview"
          }
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>
      {!collapsed && (
        <>
          {!remote() &&
          ["ready", "agent", "awaiting-approval"].includes(s.mode) &&
          tab ? (
            <PagePreview
              key={`${s.id}:${s.revision}:${s.mode}:${tab.id}:${tab.url}`}
              sessionId={s.id}
            />
          ) : (
            <div className="browser-preview">
              <p>
                {s.mode === "human"
                  ? "You have control. Preview pauses until you resume."
                  : "Open the browser to view the page."}
              </p>
            </div>
          )}
          {tab && (
            <p className="browser-panel-page" title={tab.url}>
              {tab.title ? <span>{tab.title} · </span> : null}
              <code>{tab.url}</code>
            </p>
          )}
          {note && <p className="browser-panel-note">{note}</p>}
          <ErrorNote error={error} />
          {remote() ? (
            <p className="browser-panel-note">
              Control the browser from your laptop.
            </p>
          ) : (
            <div className="modal-actions">
              <button
                disabled={!!busy}
                onClick={() => void run("show", post("show"))}
              >
                <SquareArrowOutUpRight size={14} />
                Open browser
              </button>
              {s.mode !== "human" && (
                <button
                  disabled={!!busy || s.mode === "handoff-pending"}
                  onClick={() => void run("minimize", post("minimize"))}
                >
                  <Minimize2 size={14} /> Minimize window
                </button>
              )}
              {s.mode === "human" ? (
                <button
                  className="primary"
                  disabled={!!busy}
                  onClick={() => void resumeBrowser()}
                >
                  <Play size={14} />
                  Resume {botName}
                </button>
              ) : (
                <button
                  className="primary"
                  disabled={!!busy || s.mode === "handoff-pending"}
                  onClick={() => void run("take", post("take-control"))}
                >
                  <Hand size={14} />
                  {busy === "take" ? "Taking control…" : "Take control"}
                </button>
              )}
              {s.mode !== "stopped" && (
                <button
                  disabled={!!busy}
                  onClick={() => void run("stop", post("stop"))}
                >
                  <Square size={12} />
                  Stop
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

const ACTION_LABEL: Record<BrowserAction["action"], string> = {
  click: "Click",
  fill: "Type into",
  "fill-and-submit": "Type into and submit",
  navigate: "Open a page",
};
const RESULT: Partial<Record<BrowserAction["state"], string>> = {
  succeeded: "Done",
  denied: "Declined",
  invalidated: "Withdrawn",
  "handed-to-user": "You're doing this step",
  failed: "Didn't happen",
  unknown: "Not sure it went through. Check the page; it won't be repeated.",
};

/**
 * A browser interaction waiting for review. Approval covers exactly this page,
 * element and text; "I'll do it" hands the browser to the user instead.
 */
export function BrowserActionCard({
  action: a,
  botName,
  onRefresh,
}: {
  action: BrowserAction;
  botName: string;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const open = a.state === "pending" && Date.parse(a.expiresAt) > Date.now();
  async function decide(decision: "approve" | "deny" | "manual") {
    setBusy(true);
    setError("");
    try {
      await api("browser/actions/resolve", {
        id: a.id,
        digest: a.digest,
        decision,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      await onRefresh();
      setBusy(false);
    }
  }
  return (
    <div className="approval-card">
      <div className="approval-heading">
        <Globe size={18} />
        <strong>
          {botName} wants to {ACTION_LABEL[a.action].toLowerCase()}
          {a.action === "navigate" ? " at " : " on "}
          {new URL(a.origin).host}
        </strong>
        <span>
          {open ? "Needs your approval" : (RESULT[a.state] ?? a.state)}
        </span>
      </div>
      <dl className="browser-action-details">
        <dt>{a.action === "navigate" ? "From" : "Page"}</dt>
        <dd>
          <code>{a.url}</code>
        </dd>
        {a.action === "navigate" ? (
          <>
            <dt>Opens</dt>
            <dd>
              <pre>{a.content}</pre>
              <small>{a.target}</small>
            </dd>
          </>
        ) : (
          <>
            <dt>Element</dt>
            <dd>{a.target}</dd>
            {a.content !== null && (
              <>
                <dt>Text</dt>
                <dd>
                  <pre>{a.content}</pre>
                </dd>
              </>
            )}
          </>
        )}
      </dl>
      {a.error && !open && <p className="action-error">{a.error}</p>}
      <ErrorNote error={error} />
      {open && remote() && (
        <p className="browser-panel-note">Review this on your laptop.</p>
      )}
      {open && !remote() && (
        <div className="modal-actions">
          <button disabled={busy} onClick={() => void decide("deny")}>
            Decline
          </button>
          <button disabled={busy} onClick={() => void decide("manual")}>
            <Hand size={14} />
            I'll do it myself
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void decide("approve")}
          >
            <Check size={15} />
            Approve
          </button>
        </div>
      )}
    </div>
  );
}
