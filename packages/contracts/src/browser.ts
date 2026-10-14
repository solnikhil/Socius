import { z } from "zod";

/**
 * Who may drive a bot's browser right now. Exactly one owner holds input at a
 * time; every ownership change increments the session's control revision.
 *
 * - `ready`: nobody is driving; the bot may take the browser for a task.
 * - `agent`: the bound task drives it through the runtime's browser tools.
 * - `awaiting-approval`: the agent proposed an interaction and waits for review.
 * - `handoff-pending`: the user asked for control; automation is being drained.
 * - `human`: the user drives the real window; the agent can neither act nor observe.
 * - `stopped`: the user stopped browsing or the runtime restarted. Nothing replays.
 * - `failed`: the browser could not start or crashed.
 */
export const BrowserControlMode = z.enum([
  "ready",
  "agent",
  "awaiting-approval",
  "handoff-pending",
  "human",
  "stopped",
  "failed",
]);
export type BrowserControlMode = z.infer<typeof BrowserControlMode>;

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  active: boolean;
}

/** A page the agent read during a task, kept so answers can cite their sources. */
export interface BrowserVisit {
  url: string;
  title: string;
  at: string;
}

/**
 * Private session metadata for one bot's dedicated browser profile. Cookies and
 * profile files stay on disk under the runtime data directory and never appear
 * in this record, frontend snapshots, templates or exports.
 */
export interface BrowserSession {
  id: string;
  /** Owning bot. Group membership never grants another bot's session. */
  botId: string;
  /** The foreground task currently bound to the session, if any. */
  taskId: string | null;
  /** The group chat the bound task belongs to, so Resume continues there. */
  groupId: string | null;
  mode: BrowserControlMode;
  /** Monotonic control revision; stale commands and approvals are refused. */
  revision: number;
  /** Local device that holds human control, so another device cannot also claim it. */
  humanDeviceId: string | null;
  /** The user's request that started the current browsing task. */
  objective: string | null;
  tabs: BrowserTab[];
  /** Last URL the runtime confirmed after one of its own commands. */
  lastConfirmedUrl: string | null;
  /** Short record of the last command and its outcome. */
  lastAction: string | null;
  visits: BrowserVisit[];
  /** Why the session is stopped, failed or paused. Never contains page data. */
  note: string | null;
  updatedAt: string;
}

export const BrowserInteraction = z.enum(["click", "fill", "fill-and-submit"]);
export type BrowserInteraction = z.infer<typeof BrowserInteraction>;

/**
 * An interaction with possible external effects, bound to an exact session,
 * control revision, page, element and content. It runs only after approval and
 * a fresh revalidation; takeover, revoke or resume invalidates it.
 */
export interface BrowserAction {
  id: string;
  sessionId: string;
  botId: string;
  taskId: string;
  revision: number;
  pageRevision: number;
  origin: string;
  url: string;
  action: BrowserInteraction;
  /** Element reference from the agent's observation, e.g. `e12`. */
  ref: string;
  /** What the element is, as the page describes it: role, name and form target. */
  target: string;
  /** Exact text that would be typed, or null for a click. */
  content: string | null;
  digest: string;
  state:
    | "pending"
    | "executing"
    | "succeeded"
    | "denied"
    | "invalidated"
    | "failed"
    | "unknown"
    | "handed-to-user";
  error: string | null;
  /** Where the page went after the interaction, when known. */
  resultUrl: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

const uuid = z.string().uuid();
export const BrowserGrantInput = z.strictObject({
  botId: uuid,
  granted: z.boolean(),
});
export const BrowserSessionInput = z.strictObject({ sessionId: uuid });
export const BrowserBotInput = z.strictObject({ botId: uuid });
export const BrowserActionDecision = z.strictObject({
  id: uuid,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  /** `manual` hands the step to the user: the agent's proposal never runs. */
  decision: z.enum(["approve", "deny", "manual"]),
});
