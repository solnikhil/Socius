import type { BotInstance, Capability, Manifest } from "./index.js";
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
  botId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  taskId: string;
}
export interface Task {
  id: string;
  botId: string;
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
  state: "pending" | "approved" | "denied";
  expiresAt: string;
  createdAt: string;
}
export interface Installation {
  id: string;
  version: string;
  digest: string;
  installedAt: string;
}
export interface Snapshot {
  bots: BotInstance[];
  catalog: Manifest[];
  installations: Installation[];
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
export interface InstallPreview {
  packages: Manifest[];
  requestedCapabilities: Capability[];
  grantsPermissions: false;
  digest: string;
}
