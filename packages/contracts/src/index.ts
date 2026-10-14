import { z } from "zod";

// Socius package IDs are `publisher/name`. Agent Skills names may start with a digit.
export const PackageId = z
  .string()
  .max(130)
  .regex(/^[a-z][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/);
export const Version = z
  .string()
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
export const Digest = z.string().regex(/^[a-f0-9]{64}$/);
// Upstream MCP Registry identities are reverse-DNS names kept separately from Socius IDs.
export const McpServerName = z
  .string()
  .max(200)
  .regex(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
// Agent Skills `name`: lowercase letters, digits and single hyphens, matching its directory.
export const SkillName = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
// V1 deliberately uses exact dependency versions; ranges need a real resolver.
export const Dependency = z.strictObject({ id: PackageId, version: Version });
export const Capability = z.enum([
  "files.read",
  "files.write",
  "web.read",
  "browser.control",
  "messages.read",
  "messages.send",
  "calendar.read",
  "calendar.write",
  "documents.read",
  "documents.write",
  "memory.read",
  "memory.write",
  "tasks.delegate",
  "routines.manage",
]);
const base = {
  schemaVersion: z.literal(1),
  id: PackageId,
  version: Version,
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(1024),
  publisher: z.string().min(1).max(100),
  license: z.string().min(1).max(200),
  capabilities: z
    .array(Capability)
    .refine((a) => new Set(a).size === a.length, "Duplicate capability"),
  dependencies: z
    .array(Dependency)
    .refine(
      (a) => new Set(a.map((d) => d.id)).size === a.length,
      "Duplicate dependency",
    ),
  // Agent Skills `compatibility` free text, preserved for display and export.
  compatibility: z.string().min(1).max(500).optional(),
  // Oldest Socius runtime able to load this release.
  minRuntime: Version.optional(),
};
export const SkillResource = z.strictObject({
  path: z
    .string()
    .min(1)
    .max(300)
    .regex(/^[A-Za-z0-9_][A-Za-z0-9._-]*(\/[A-Za-z0-9_][A-Za-z0-9._-]*)*$/)
    .refine((p) => p !== "SKILL.md", "SKILL.md is not a resource"),
  sha256: Digest,
  size: z
    .number()
    .int()
    .min(0)
    .max(1024 * 1024),
  // Scripts are stored inert. V1 never executes or loads them into model context.
  kind: z.enum(["reference", "asset", "script"]),
});
export const SkillManifest = z.strictObject({
  ...base,
  kind: z.literal("skill"),
  instructions: z.string().min(1).max(100_000),
  // Agent Skills `allowed-tools` are requests. Runtime policy decides what exists.
  allowedTools: z.array(z.string().min(1).max(200)).max(50).optional(),
  resources: z.array(SkillResource).max(200).optional(),
  metadata: z
    .record(z.string().min(1).max(64), z.string().max(1000))
    .optional(),
});
export const ConnectorTool = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/),
  access: z.enum(["read", "write"]),
  capability: Capability,
  description: z.string().min(1).max(500),
});
export const ConnectorManifest = z.strictObject({
  ...base,
  kind: z.literal("connector"),
  protocol: z.literal("mcp"),
  // Description only. Never embed credentials or executable launch commands.
  setup: z.string().min(1),
  transport: z.enum(["stdio", "streamable-http"]),
  authentication: z.enum(["none", "oauth", "api-key"]),
  upstream: z
    .strictObject({
      registry: z.literal("io.modelcontextprotocol.registry"),
      name: McpServerName,
      version: z.string().min(1).max(64),
      remoteUrl: z.string().url(),
    })
    .optional(),
  // Reviewed narrow actions. The runtime executes only matching reviewed code.
  tools: z.array(ConnectorTool).max(50).optional(),
});
export const BotManifest = z.strictObject({
  ...base,
  kind: z.literal("bot"),
  role: z.string().min(1).max(200),
  instructions: z.string().min(1).max(20_000),
  modelRequirement: z.enum(["text", "tools", "vision-and-tools"]),
});
export const Manifest = z.discriminatedUnion("kind", [
  SkillManifest,
  ConnectorManifest,
  BotManifest,
]);
export type Manifest = z.infer<typeof Manifest>;
export type SkillManifest = z.infer<typeof SkillManifest>;
export type ConnectorManifest = z.infer<typeof ConnectorManifest>;
export type BotManifest = z.infer<typeof BotManifest>;
export type Capability = z.infer<typeof Capability>;
export type SkillResource = z.infer<typeof SkillResource>;

// Where a release came from. Trust describes review, not just content consistency.
export const ReleaseSource = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("bundled") }),
  z.strictObject({
    type: z.literal("local-import"),
    label: z.string().min(1).max(200),
  }),
  z.strictObject({
    type: z.literal("mcp-registry"),
    name: McpServerName,
    version: z.string().min(1).max(64),
  }),
]);
export type ReleaseSource = z.infer<typeof ReleaseSource>;
// curated: bundled after Socius review. reviewed: registry metadata matched a Socius review.
// local-unverified: user import; the digest proves consistency, not publisher authenticity.
export const TrustStatus = z.enum(["curated", "reviewed", "local-unverified"]);
export type TrustStatus = z.infer<typeof TrustStatus>;
export const ReleaseIdentity = z.strictObject({
  id: PackageId,
  version: Version,
  digest: Digest,
});
export type ReleaseIdentity = z.infer<typeof ReleaseIdentity>;

// Shared action-broker request used by single bots and board tasks. Callers name a
// reviewed action and arguments only; they cannot supply code or grant permissions.
export const ActionActor = z.strictObject({
  botId: z.string().uuid(),
  taskId: z.string().min(1).max(100),
  boardId: z.string().min(1).max(100).optional(),
  runId: z.string().min(1).max(100).optional(),
});
export type ActionActor = z.infer<typeof ActionActor>;
export const ActionRequest = z.strictObject({
  actor: ActionActor,
  release: ReleaseIdentity,
  action: ConnectorTool.shape.id,
  arguments: z.record(z.string(), z.unknown()),
});
export type ActionRequest = z.infer<typeof ActionRequest>;

export const TaskState = z.enum([
  "queued",
  "running",
  "awaiting-approval",
  "awaiting-user",
  "completed",
  "failed",
  "cancelled",
]);
export type TaskState = z.infer<typeof TaskState>;
export interface BotInstance {
  id: string;
  template: { id: string; version: string };
  name: string;
  role: string;
  instructions: string;
  memoryNamespace: string;
  grantedCapabilities: Capability[];
  routinesEnabled: false;
}
