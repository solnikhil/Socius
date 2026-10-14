import type {
  ActionActor,
  BotInstance,
  BotManifest,
  Capability,
  Manifest,
  ReleaseIdentity,
  ReleaseSource,
  TrustStatus,
} from "./index.js";
import type {
  ModelEntry,
  ModelRef,
  ModelSelection,
  ProviderConnection,
  ProviderErrorCode,
  ProviderId,
} from "./providers.js";
export interface Message {
  id: string;
  /** The bot whose conversation this is, or in a group the bot that wrote it. */
  botId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  taskId: string;
  /** Set on group chat messages. Direct chats never include them. */
  groupId?: string;
}
/** A shared thread where the main bot coordinates the member bots. */
export interface GroupChat {
  id: string;
  name: string;
  /** Specialists in the group. The main bot always coordinates and is not listed. */
  memberIds: string[];
  createdAt: string;
}
export interface Task {
  id: string;
  botId: string;
  groupId?: string;
  state: "running" | "completed" | "failed" | "cancelled";
  error: string | null;
  /** Stable error category for failed model calls. */
  errorCode?: ProviderErrorCode;
  /** The model that ran this task. */
  model?: ModelRef;
  createdAt: string;
}
export interface Memory {
  id: string;
  botId: string;
  content: string;
  source: string;
  updatedAt: string;
}
export interface Activity {
  id: string;
  kind: string;
  description: string;
  createdAt: string;
}
export interface BotDraft {
  name: string;
  role: string;
  instructions: string;
}
export interface Approval {
  id: string;
  botId: string;
  taskId: string;
  kind: "memory" | "bot";
  content: string;
  payload: string | BotDraft;
  digest: string;
  /** Present when the proposal came from a board run. */
  runId?: string;
  state: "pending" | "approved" | "denied";
  expiresAt: string;
  createdAt: string;
}
/** A catalog release: manifest plus immutable identity, provenance and trust. */
export interface Release {
  manifest: Manifest;
  digest: string;
  source: ReleaseSource;
  trust: TrustStatus;
  compatible: boolean;
  incompatibility: string | null;
}
export interface InstallationHistoryEntry {
  version: string;
  digest: string;
  installedAt: string;
}
export interface Installation {
  id: string;
  version: string;
  digest: string;
  installedAt: string;
  enabled: boolean;
  source: ReleaseSource;
  trust: TrustStatus;
  /** Capabilities the user consented to for this exact release. Consent is not a bot grant. */
  consentedCapabilities: Capability[];
  /** Earlier releases, newest last, used for rollback. */
  history: InstallationHistoryEntry[];
}
export type ConnectionState =
  | "ready"
  | "authentication-required"
  | "disconnected"
  | "unsupported"
  | "failed";
export interface ConnectorConnection {
  id: string;
  connectorId: string;
  state: ConnectionState;
  accountLabel: string;
  /** Human-readable explanation of the state; never contains credentials. */
  detail: string;
  createdAt: string;
  updatedAt: string;
}
export type ActionState =
  | "pending"
  | "denied"
  | "expired"
  | "blocked"
  | "executing"
  | "succeeded"
  | "failed"
  | "unknown";
export interface ActionAttempt {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  outcome: "succeeded" | "failed" | "rate-limited" | "ambiguous" | null;
  detail: string | null;
  /** Remote state observed just before the write, used only for reconciliation. */
  baseline: string | null;
}
/** A durable external write proposal bound to actor, release, action and exact arguments. */
export interface ActionRecord {
  id: string;
  actor: ActionActor;
  release: ReleaseIdentity;
  connectionId: string;
  action: string;
  capability: Capability;
  arguments: Record<string, unknown>;
  summary: string;
  digest: string;
  state: ActionState;
  attempts: ActionAttempt[];
  result: { summary: string; url: string | null } | null;
  error: string | null;
  /** True only when the last failure proved the remote effect did not happen. */
  retryable: boolean;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}
export interface Snapshot {
  bots: BotInstance[];
  groups: GroupChat[];
  catalog: Manifest[];
  releases: Release[];
  installations: Installation[];
  /** Connected-app accounts (Notion, …); model providers are `connections`. */
  connectorConnections: ConnectorConnection[];
  actions: ActionRecord[];
  activity: Activity[];
  approvals: Approval[];
  tasks: Task[];
  connections: ProviderConnection[];
  models: ModelEntry[];
  selection: ModelSelection;
  /** Per provider, fields an environment variable already supplies. Never values. */
  environment: Partial<Record<ProviderId, string[]>>;
  /** Whether credentials entered in the interface can be stored encrypted. */
  boards: Board[];
  secretStorage: boolean;
}
export interface InstallPreviewPackage {
  manifest: Manifest;
  digest: string;
  source: ReleaseSource;
  trust: TrustStatus;
  installed: { version: string; digest: string } | null;
}
export interface InstallPreview {
  packages: InstallPreviewPackage[];
  requestedCapabilities: Capability[];
  /** Requested capabilities not covered by consent already given to installed releases. */
  newCapabilities: Capability[];
  grantsPermissions: false;
  digest: string;
}
export interface ReviewFinding {
  field: string;
  kind: "email" | "phone" | "url" | "secret" | "private-memory" | "path";
  excerpt: string;
}
export interface ExportPreview {
  kind: "skill" | "bot";
  files: { path: string; content: string }[];
  findings: ReviewFinding[];
  digest: string;
}
export interface BotExportDraft {
  name: string;
  description: string;
  role: string;
  instructions: string;
  version: string;
  license: string;
}
export type { BotManifest };
export interface RegistryServerView {
  name: string;
  version: string;
  description: string;
  repositoryUrl: string | null;
  remotes: { type: string; url: string }[];
  packages: { registryType: string; identifier: string }[];
  isLatest: boolean;
  /** Socius connector ID when a review matches this exact name, version and remote. */
  reviewedConnectorId: string | null;
  reviewNote: string;
}
export interface RegistryPage {
  servers: RegistryServerView[];
  nextCursor: string | null;
  fetchedAt: string;
  stale: boolean;
  skipped: number;
  error: string | null;
}

// Teams & Boards. A board groups any number of private bots; membership grants no authority.
export interface BoardMember {
  botId: string;
  /** Board-specific responsibility; the bot's own instructions and grants are unchanged. */
  role: string;
  joinedAt: string;
}
export interface BoardBudgets {
  /** Simultaneous specialist executions per run. Larger rosters queue. */
  concurrency: number;
  /** Planned tasks the coordinator may propose for one run. */
  maxTasks: number;
  /** Model calls per run, including planning and synthesis. */
  maxModelCalls: number;
  /** Tool-loop steps per model call. */
  maxStepsPerCall: number;
  /** Wall-clock limit for one model call. */
  callTimeoutMs: number;
  /** Output tokens per model call. */
  maxOutputTokens: number;
  /** Reported input + output tokens per run (the spend proxy; providers do not report cost). */
  maxRunTokens: number;
}
export interface Board {
  schemaVersion: 1;
  id: string;
  name: string;
  objective: string;
  completionCriteria: string;
  coordinatorId: string;
  members: BoardMember[];
  budgets: BoardBudgets;
  /** When true, the coordinator's plan waits in the thread for the user to run or revise it. */
  reviewPlan: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}
/** Explicitly shared board context. Private bot memory is never copied here. */
export interface BoardSource {
  id: string;
  boardId: string;
  name: string;
  text: string;
  addedAt: string;
}
export type RunState =
  | "planning"
  | "awaiting-approval"
  | "running"
  | "synthesizing"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled"
  | "interrupted";
export interface BoardRun {
  id: string;
  boardId: string;
  request: string;
  coordinatorId: string;
  state: RunState;
  /** Why the run stopped short, in plain language. */
  outcome: string | null;
  result: string | null;
  usage: { modelCalls: number; tokens: number };
  /** User replies that revised the plan before it ran, oldest first. */
  revisions: { plan: string; feedback: string }[];
  createdAt: string;
  finishedAt: string | null;
}
/**
 * Board columns derive from these states. Blocked backlog work and tasks with
 * pending approvals appear under Needs input; failed/cancelled/interrupted are history.
 */
export type BoardTaskState =
  | "backlog"
  | "ready"
  | "working"
  | "done"
  | "failed"
  | "cancelled"
  | "interrupted";
export interface BoardTask {
  id: string;
  boardId: string;
  runId: string;
  /** Stable key within the coordinator's plan; dependencies refer to keys. */
  key: string;
  title: string;
  instructions: string;
  assigneeId: string;
  dependsOn: string[];
  sourceIds: string[];
  state: BoardTaskState;
  result: string | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}
export interface BoardMessage {
  id: string;
  boardId: string;
  runId: string | null;
  taskId: string | null;
  kind: "user" | "decision" | "contribution" | "blocker" | "synthesis";
  /** Null for user messages; otherwise the contributing bot. */
  botId: string | null;
  content: string;
  createdAt: string;
}
export interface BoardDetail {
  board: Board;
  sources: BoardSource[];
  runs: BoardRun[];
  tasks: BoardTask[];
  messages: BoardMessage[];
}
