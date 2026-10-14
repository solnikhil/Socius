import { History } from "lucide-react";
import type { Activity } from "@socius/contracts/app";

const labels: Record<string, string> = {
  "bot.created": "Bot created",
  "task.started": "Task started",
  "task.completed": "Task completed",
  "task.failed": "Task failed",
  "task.cancelled": "Task cancelled",
  "task.interrupted": "Task interrupted",
  "approval.requested": "Review requested",
  "approval.resolved": "Review resolved",
  "memory.saved": "Memory saved",
  "memory.deleted": "Memory deleted",
  "permissions.updated": "Permissions changed",
  "package.installed": "App installed",
  "settings.updated": "Settings saved",
  "package.imported": "Package imported",
  "package.updated": "App updated",
  "package.enabled": "App enabled",
  "package.disabled": "App disabled",
  "package.uninstalled": "App uninstalled",
  "package.rolled-back": "App rolled back",
  "package.exported": "Skill exported",
  "bot.exported": "Template exported",
  "connector.sign-in": "Sign-in started",
  "connector.connected": "App connected",
  "connector.disconnected": "App disconnected",
  "connector.read": "App data read",
  "action.requested": "Change needs review",
  "action.approved": "Change approved",
  "action.denied": "Change declined",
  "action.succeeded": "Change made",
  "action.failed": "Change not made",
  "action.unknown": "Change outcome unclear",
  "action.interrupted": "Change interrupted",
  "action.retried": "Change retried",
};

function tone(kind: string) {
  if (
    kind.endsWith("failed") ||
    kind.endsWith("interrupted") ||
    kind.endsWith("cancelled")
  )
    return "bad";
  if (kind.endsWith("unknown")) return "bad";
  if (kind === "approval.requested" || kind === "action.requested")
    return "warn";
  if (
    kind.endsWith("completed") ||
    kind.endsWith("installed") ||
    kind.endsWith("saved") ||
    kind.endsWith("succeeded") ||
    kind === "connector.connected" ||
    kind === "bot.created"
  )
    return "good";
  return "";
}

export function relativeTime(iso: string, now = Date.now()) {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diff = now - then;
  if (diff < 0)
    return new Date(then).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "Just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(then).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function ActivityList({ events }: { events: Activity[] }) {
  if (!events.length)
    return (
      <p className="activity-empty">
        Nothing recorded yet. Chats, reviews, memory changes, and installs show
        up here.
      </p>
    );
  return (
    <ol className="activity-list">
      {events.map((event) => (
        <li key={event.id}>
          <span
            className={`activity-mark ${tone(event.kind)}`}
            aria-hidden="true"
          />
          <div>
            <strong>{labels[event.kind] ?? event.kind}</strong>
            <p>{event.description}</p>
          </div>
          <time
            dateTime={event.createdAt}
            title={new Date(event.createdAt).toLocaleString()}
          >
            {relativeTime(event.createdAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}

export function ActivityView({ events }: { events: Activity[] }) {
  return (
    <section className="page activity-page">
      <span className="eyebrow">ON THIS COMPUTER</span>
      <h1>Activity</h1>
      <p className="subtitle">
        Newest first. A local record of chats, reviews, memory changes, and
        installs. Provider keys and raw error text are omitted.
      </p>
      <div className="settings-card activity-card">
        <div className="settings-heading">
          <History size={20} />
          <div>
            <h2>Workspace activity</h2>
            <p>
              {events.length === 0
                ? "The latest 100 events are kept."
                : `${events.length} event${events.length === 1 ? "" : "s"} kept locally.`}
            </p>
          </div>
        </div>
        <ActivityList events={events} />
      </div>
    </section>
  );
}
