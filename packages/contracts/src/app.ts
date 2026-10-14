import type { BotInstance, Capability, Manifest } from "./index.js";
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
export interface ModelSettings {
  provider: "ollama" | "compatible" | "openai" | "anthropic";
  model: string;
  baseURL: string;
  hasApiKey: boolean;
}
export interface Snapshot {
  bots: BotInstance[];
  groups: GroupChat[];
  catalog: Manifest[];
  installations: Installation[];
  activity: Activity[];
  approvals: Approval[];
  tasks: Task[];
  settings: ModelSettings;
  secretStorage: boolean;
}
export interface InstallPreview {
  packages: Manifest[];
  requestedCapabilities: Capability[];
  grantsPermissions: false;
  digest: string;
}
