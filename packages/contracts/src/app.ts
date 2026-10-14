import type { BotInstance, Capability, Manifest } from "./index.js";
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
  catalog: Manifest[];
  installations: Installation[];
  activity: Activity[];
  approvals: Approval[];
  tasks: Task[];
  boards: Board[];
  settings: ModelSettings;
  secretStorage: boolean;
}
export interface InstallPreview {
  packages: Manifest[];
  requestedCapabilities: Capability[];
  grantsPermissions: false;
  digest: string;
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
/**
 * Broker boundary shared with the connectors workstream. Team execution submits
 * this typed request; the broker owns authorization, approvals and execution.
 */
export interface ActionRequest {
  botId: string;
  boardId: string | null;
  runId: string | null;
  taskId: string;
  release: { id: string; version: string };
  action: string;
  arguments: unknown;
}
