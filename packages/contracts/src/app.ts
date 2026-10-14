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
  /** The user's reaction to a bot's reply. The bot reads it as feedback. */
  reaction?: Reaction;
}
/** Reactions the user can leave on a bot's reply, with what each tells the bot. */
export const REACTIONS = {
  "👍": "liked it",
  "❤️": "loved it",
  "😂": "found it funny",
  "😮": "was surprised by it",
  "🤔": "was unsure or unconvinced",
  "👎": "did not like it",
} as const;
export type Reaction = keyof typeof REACTIONS;
/** A shared thread where the main bot coordinates the member bots. */
export interface GroupChat {
  id: string;
  name: string;
  /** Specialists in the group. The main bot always coordinates and is not listed. */
  memberIds: string[];
  /** Member requests Socius may make per user message; defaults to 6. 0 means Socius answers alone. */
  maxAsks?: number;
  createdAt: string;
}
/**
 * A sidebar category for organising bots. Categories are labels only: bots in
 * a category share nothing and never talk to each other. Use a group chat for
 * that. A bot is in at most one category; the main bot is never in one.
 */
export interface Category {
  id: string;
  name: string;
  botIds: string[];
  createdAt: string;
}
/** Sidebar placement for one bot. Absent means unpinned, visible and read. */
export interface BotLayout {
  botId: string;
  pinned: boolean;
  hidden: boolean;
  /** The user marked the direct chat unread. Opening the chat clears it. */
  unread: boolean;
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
  categories: Category[];
  layouts: BotLayout[];
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

/** Public device metadata; session hashes and challenge material are never in snapshots. */
export interface PairedDevice {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  originKind: "local" | "remote";
}
export interface PhonePairing {
  token: string;
  code: string;
  expiresAt: string;
}
