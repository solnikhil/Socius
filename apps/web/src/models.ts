import type { Snapshot } from "@socius/contracts/app";
import {
  provider,
  type ModelEntry,
  type ModelRef,
  type ProviderConnection,
  type ProviderDescriptor,
} from "@socius/contracts/providers";

export type SettingsTab =
  "general" | "models" | "providers" | "dreaming" | "privacy";
/** Opens Settings at a tab, optionally focused on one connection. */
export type OpenSettings = (tab: SettingsTab, connectionId?: string) => void;

export const sameModel = (a: ModelRef | null | undefined, b: ModelRef) =>
  !!a && a.connectionId === b.connectionId && a.modelId === b.modelId;
export const modelKey = (m: ModelRef) => `${m.connectionId}\u0000${m.modelId}`;

export function connectionOf(
  state: Snapshot,
  connectionId: string,
): { connection: ProviderConnection; descriptor: ProviderDescriptor } | null {
  const connection = state.connections.find((c) => c.id === connectionId);
  return connection
    ? { connection, descriptor: provider(connection.provider) }
    : null;
}

/** The model a bot will use, following its override then the default. */
export function resolvedModel(
  state: Snapshot,
  botId: string,
): { entry: ModelEntry; override: boolean } | null {
  const override = state.selection.bots[botId];
  const ref = override ?? state.selection.default;
  const entry = ref && state.models.find((m) => sameModel(ref, m));
  return entry ? { entry, override: !!override } : null;
}

/** Codes where the fix lives in Settings rather than in the message. */
export const SETUP_CODES = new Set([
  "credentials_missing",
  "unauthorized",
  "forbidden",
  "model_not_found",
  "unreachable",
  "tools_unsupported",
  "quota_exceeded",
]);

export function destinationNote(d: ProviderDescriptor, label?: string) {
  const name = label && label !== d.name ? `${label} (${d.name})` : d.name;
  return d.destination === "local"
    ? `Chat context stays on this computer, sent only to ${name}.`
    : d.destination === "endpoint"
      ? `Chat context is sent to the ${name} endpoint you configure. It is local only if that server runs on this computer.`
      : `Your messages, attachments and any approved memory are sent to ${name}.`;
}
