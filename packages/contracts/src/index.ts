import { z } from 'zod';

export const PackageId = z.string().regex(/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/);
export const Version = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
// V1 deliberately uses exact dependency versions; ranges need a real resolver.
export const Dependency = z.strictObject({ id: PackageId, version: Version });
export const Capability = z.enum([
  'files.read', 'files.write', 'web.read', 'browser.control',
  'messages.read', 'messages.send', 'calendar.read', 'calendar.write',
  'memory.read', 'memory.write', 'tasks.delegate', 'routines.manage',
]);
const base = {
  schemaVersion: z.literal(1),
  id: PackageId,
  version: Version,
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  publisher: z.string().min(1).max(100),
  license: z.string().min(1),
  capabilities: z.array(Capability).refine(a => new Set(a).size === a.length, 'Duplicate capability'),
  dependencies: z.array(Dependency).refine(a => new Set(a.map(d => d.id)).size === a.length, 'Duplicate dependency'),
};
export const SkillManifest = z.strictObject({
  ...base, kind: z.literal('skill'), instructions: z.string().min(1),
});
export const ConnectorManifest = z.strictObject({
  ...base, kind: z.literal('connector'), protocol: z.literal('mcp'),
  // Description only. Never embed credentials or executable launch commands.
  setup: z.string().min(1),
  transport: z.enum(['stdio', 'streamable-http']),
  authentication: z.enum(['none', 'oauth', 'api-key']),
});
export const BotManifest = z.strictObject({
  ...base, kind: z.literal('bot'), role: z.string().min(1),
  instructions: z.string().min(1),
  modelRequirement: z.enum(['text', 'tools', 'vision-and-tools']),
});
export const Manifest = z.discriminatedUnion('kind', [SkillManifest, ConnectorManifest, BotManifest]);
export type Manifest = z.infer<typeof Manifest>;
export type BotManifest = z.infer<typeof BotManifest>;
export type Capability = z.infer<typeof Capability>;
export const TaskState = z.enum(['queued', 'running', 'awaiting-approval', 'awaiting-user', 'completed', 'failed', 'cancelled']);
export type TaskState = z.infer<typeof TaskState>;
export interface BotInstance {
  id: string;
  template: {id: string; version: string};
  name: string;
  role: string;
  instructions: string;
  memoryNamespace: string;
  grantedCapabilities: Capability[];
  routinesEnabled: false;
}
