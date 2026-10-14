import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { LanguageModel } from "ai";
import {
  PROVIDER_IDS,
  provider as describe,
  type ConnectionStatus,
  type DiscoveryResult,
  type ModelCheck,
  type ModelEntry,
  type ModelRef,
  type ProviderConnection,
  type ProviderDescriptor,
  type ProviderId,
} from "@socius/contracts/providers";
import type { Store } from "../store.js";
import type { StoredConnection } from "../provider-store.js";
import { fail } from "../http.js";
import {
  envFields,
  languageModel,
  resolveValues,
  type Fetch,
  type Values,
} from "./factory.js";
import { discoverModels } from "./discovery.js";
import { checkModel } from "./check.js";
import { classify } from "./errors.js";

export interface SecretBox {
  encrypt: (value: string) => Promise<string>;
  decrypt: (value: string) => Promise<string>;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
// Printable text without control characters.
const plain = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(/^[^\p{Cc}]*$/u, "Control characters are not allowed");
export const ModelId = plain(300).min(1);
const FieldMap = z.record(
  z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/),
  z.string(),
);
export const CreateConnection = z.strictObject({
  provider: z.enum(PROVIDER_IDS),
  label: plain(80).optional(),
  config: FieldMap.default({}),
  secrets: FieldMap.default({}),
});
export const UpdateConnection = z.strictObject({
  id: z.string().uuid(),
  label: plain(80).optional(),
  config: FieldMap.optional(),
  /** A value replaces the stored secret; `null` removes it. Omitted keys are kept. */
  secrets: z
    .record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/), z.string().nullable())
    .optional(),
});

/** Remote endpoints must use HTTPS; plain HTTP is limited to this machine. */
export function validateEndpoint(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail(400, "Enter a valid endpoint URL");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    fail(400, "Use an HTTP(S) endpoint without embedded credentials");
  if (url.protocol === "http:" && !LOOPBACK.has(url.hostname))
    fail(400, "Remote endpoints require HTTPS");
  if (url.search || url.hash)
    fail(400, "Remove query strings from the endpoint");
  return url.href.replace(/\/+$/, "");
}

function cleanConfig(d: ProviderDescriptor, input: Record<string, string>) {
  const config: Record<string, string> = {};
  for (const [key, raw] of Object.entries(input)) {
    const field = d.fields.find((f) => f.key === key);
    if (!field || field.kind === "secret")
      fail(400, `${d.name} has no setting named ${key}`);
    const value = plain(2000).parse(raw);
    if (!value) continue;
    config[key] = field!.kind === "url" ? validateEndpoint(value) : value;
  }
  return config;
}
function cleanSecrets(
  d: ProviderDescriptor,
  input: Record<string, string | null>,
) {
  for (const key of Object.keys(input)) {
    const field = d.fields.find((f) => f.key === key);
    if (!field || field.kind !== "secret")
      fail(400, `${d.name} has no credential named ${key}`);
  }
  return Object.fromEntries(
    Object.entries(input).map(([k, v]) => [
      k,
      v === null ? null : z.string().trim().max(8000).parse(v),
    ]),
  ) as Record<string, string | null>;
}

/** Owns provider connections: validation, encrypted credentials, SDK models. */
export class ProviderService {
  constructor(
    private readonly store: Store,
    private readonly box: SecretBox | undefined,
    private readonly fetch: Fetch | undefined,
    private readonly inUse: (connectionId: string) => boolean,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  view(c: StoredConnection): ProviderConnection {
    return {
      id: c.id,
      provider: c.provider,
      label: c.label,
      config: c.config,
      secrets: c.secretFields,
      env: envFields(c.provider, this.env),
      status: c.status,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }
  /** Field names satisfied by the environment, per provider. Values stay here. */
  environment(): Partial<Record<ProviderId, string[]>> {
    return Object.fromEntries(
      PROVIDER_IDS.map((id) => [id, envFields(id, this.env)]).filter(
        ([, fields]) => fields!.length > 0,
      ),
    );
  }
  list(): ProviderConnection[] {
    return this.store.providers.connections().map((c) => this.view(c));
  }
  get(id: string): StoredConnection {
    return (
      this.store.providers.connection(z.string().uuid().parse(id)) ??
      fail(404, "Provider connection not found")
    );
  }

  private async decrypt(c: StoredConnection): Promise<Record<string, string>> {
    if (!c.secret) return {};
    if (!this.box)
      return fail(
        409,
        "This runtime cannot read saved credentials. Use the desktop app or environment variables.",
      );
    let plainText: string;
    try {
      plainText = await this.box.decrypt(c.secret);
    } catch {
      return fail(
        409,
        "Saved credentials could not be decrypted. Enter them again.",
      );
    }
    if (c.secretFormat === "legacy") return { apiKey: plainText };
    try {
      const parsed = JSON.parse(plainText) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(parsed).filter(
          (e): e is [string, string] => typeof e[1] === "string",
        ),
      );
    } catch {
      return fail(409, "Saved credentials are unreadable. Enter them again.");
    }
  }
  private async encrypt(secrets: Record<string, string>) {
    const keys = Object.keys(secrets);
    if (!keys.length)
      return { secret: null, secretFormat: null, secretFields: [] };
    if (!this.box)
      return fail(
        409,
        "This web runtime does not store credentials. Use the desktop app or environment variables.",
      );
    return {
      secret: await this.box.encrypt(JSON.stringify(secrets)),
      secretFormat: "json" as const,
      secretFields: keys.sort(),
    };
  }
  private requireFields(
    d: ProviderDescriptor,
    config: Record<string, string>,
    secretFields: string[],
  ) {
    for (const f of d.fields) {
      if (!f.required) continue;
      const present =
        f.kind === "secret" ? secretFields.includes(f.key) : !!config[f.key];
      if (!present && !(f.env && this.env[f.env]) && !f.default)
        fail(400, `${f.label} is required for ${d.name}`);
    }
  }

  async create(input: z.infer<typeof CreateConnection>) {
    const d = describe(input.provider);
    const config = cleanConfig(d, input.config);
    const secrets = Object.fromEntries(
      Object.entries(cleanSecrets(d, input.secrets)).filter(
        (e): e is [string, string] => !!e[1],
      ),
    );
    this.requireFields(d, config, Object.keys(secrets));
    const now = new Date().toISOString();
    const stored: Omit<StoredConnection, "status"> = {
      id: randomUUID(),
      provider: d.id,
      label: input.label || d.name,
      config,
      ...(await this.encrypt(secrets)),
      createdAt: now,
      updatedAt: now,
    };
    this.store.providers.createConnection(stored);
    this.store.event("provider.connected", `Connected ${d.name}.`);
    return this.view(this.get(stored.id));
  }

  async update(input: z.infer<typeof UpdateConnection>) {
    const current = this.get(input.id);
    const d = describe(current.provider);
    if (this.inUse(current.id))
      fail(409, "Wait for running tasks that use this provider to finish");
    const config = input.config ? cleanConfig(d, input.config) : current.config;
    const changes = cleanSecrets(d, input.secrets ?? {});
    const endpointChanged =
      (config.baseURL ?? "") !== (current.config.baseURL ?? "");
    let secretPatch: Pick<
      StoredConnection,
      "secret" | "secretFormat" | "secretFields"
    > = current;
    // A new endpoint never silently receives credentials saved for the old one.
    if (endpointChanged && current.secret && !("apiKey" in changes))
      changes.apiKey = null;
    if (Object.keys(changes).length) {
      const secrets = await this.decrypt(current);
      for (const [k, v] of Object.entries(changes)) {
        if (v) secrets[k] = v;
        else delete secrets[k];
      }
      secretPatch = await this.encrypt(secrets);
    }
    this.requireFields(d, config, secretPatch.secretFields);
    const invalidate =
      Object.keys(changes).length > 0 ||
      JSON.stringify(config) !== JSON.stringify(current.config);
    // Encryption yields to other requests: revalidate before committing.
    if (this.inUse(current.id))
      fail(409, "Wait for running tasks that use this provider to finish");
    if (JSON.stringify(this.get(current.id)) !== JSON.stringify(current))
      fail(409, "This connection changed. Refresh it before saving.");
    this.store.providers.updateConnection(
      {
        id: current.id,
        label: input.label || current.label,
        config,
        ...secretPatch,
      },
      invalidate,
    );
    this.store.event("provider.updated", `Updated ${d.name} connection.`);
    return this.view(this.get(current.id));
  }

  remove(id: string) {
    const c = this.get(id);
    if (this.inUse(c.id))
      fail(409, "Wait for running tasks that use this provider to finish");
    this.store.providers.deleteConnection(c.id);
    this.store.event(
      "provider.removed",
      `Removed ${describe(c.provider).name} connection.`,
    );
  }

  async values(c: StoredConnection): Promise<Values> {
    return resolveValues(
      describe(c.provider),
      c.config,
      await this.decrypt(c),
      this.env,
    );
  }

  private status(c: StoredConnection, status: ConnectionStatus) {
    this.store.providers.setStatus(c.id, status);
    return status;
  }

  async discover(id: string, refresh: boolean): Promise<DiscoveryResult> {
    const c = this.get(id);
    const d = describe(c.provider);
    if (!d.discovery)
      fail(
        409,
        `${d.name} does not publish a model list. Enter a model ID instead.`,
      );
    const cached = this.store.providers.discovery(c.id);
    if (cached && !refresh) return cached;
    const values = await this.values(c);
    try {
      const result = {
        models: await discoverModels(c.provider, values, this.fetch),
        fetchedAt: new Date().toISOString(),
      };
      this.store.providers.saveDiscovery(c.id, result);
      this.status(c, {
        ok: true,
        checkedAt: result.fetchedAt,
        modelCount: result.models.length,
        message: `Connected. ${result.models.length} model${result.models.length === 1 ? "" : "s"} available.`,
      });
      return result;
    } catch (error) {
      const failure = classify(error, d.name, {
        timedOut: (error as Error)?.name === "TimeoutError",
      });
      this.status(c, {
        ok: false,
        checkedAt: new Date().toISOString(),
        code: failure.code,
        message: failure.message,
      });
      return fail(502, failure.message, failure.code);
    }
  }

  async testConnection(
    id: string,
    modelId?: string,
  ): Promise<ConnectionStatus> {
    const c = this.get(id);
    const d = describe(c.provider);
    if (d.discovery && !modelId) {
      await this.discover(c.id, true);
      return this.get(c.id).status!;
    }
    const target =
      modelId ??
      this.store.providers.models().find((m) => m.connectionId === c.id)
        ?.modelId ??
      fail(
        409,
        `Add a model ID to test ${d.name}. It does not publish a model list.`,
      );
    const check = await checkModel(await this.build(c, target), d.name);
    return this.status(c, {
      ok: check.ok,
      checkedAt: check.checkedAt,
      message: check.ok ? `Connected. ${target} responded.` : check.message,
      ...(check.ok || !check.code ? {} : { code: check.code }),
    });
  }

  async testModel(ref: ModelRef): Promise<ModelCheck> {
    const entry = this.entry(ref);
    const c = this.get(entry.connectionId);
    const d = describe(c.provider);
    const check = await checkModel(await this.build(c, entry.modelId), d.name);
    this.store.providers.recordModelCheck(ref, check);
    if (
      check.ok ||
      ["unauthorized", "credentials_missing", "unreachable"].includes(
        check.code ?? "",
      )
    )
      this.status(c, {
        ok: check.ok,
        checkedAt: check.checkedAt,
        message: check.ok
          ? `Connected. ${entry.modelId} responded.`
          : check.message,
        ...(check.code && !check.ok ? { code: check.code } : {}),
      });
    return check;
  }

  addModel(ref: ModelRef, label?: string): ModelEntry {
    const c = this.get(ref.connectionId);
    const modelId = ModelId.parse(ref.modelId);
    const discovered = this.store.providers
      .discovery(c.id)
      ?.models.find((m) => m.id === modelId);
    this.store.transaction(() => {
      this.store.providers.addModel({
        connectionId: c.id,
        modelId,
        label: label || discovered?.name || modelId,
        source: discovered ? "discovered" : "manual",
        tools: discovered?.tools ?? null,
      });
      if (!this.store.providers.selection().default)
        this.store.providers.select("default", { connectionId: c.id, modelId });
    });
    this.store.event(
      "model.added",
      `Added ${modelId} from ${describe(c.provider).name}.`,
    );
    return this.entry({ connectionId: c.id, modelId });
  }
  removeModel(ref: ModelRef) {
    const entry = this.entry(ref);
    if (this.inUse(entry.connectionId))
      fail(409, "Wait for running tasks that use this provider to finish");
    this.store.providers.removeModel(entry);
    this.store.event("model.removed", `Removed ${entry.modelId}.`);
  }
  entry(ref: ModelRef): ModelEntry {
    return (
      this.store.providers.model({
        connectionId: z.string().uuid().parse(ref.connectionId),
        modelId: ModelId.parse(ref.modelId),
      }) ?? fail(404, "Model not found. Add it in Settings → Models.")
    );
  }

  private async build(
    c: StoredConnection,
    modelId: string,
  ): Promise<LanguageModel> {
    return languageModel(c.provider, await this.values(c), modelId, this.fetch);
  }

  /** Resolves the model a bot should use for chat. */
  async forChat(botId: string) {
    const ref =
      this.store.providers.resolve(botId) ??
      fail(409, "Choose a model in Settings → Models first");
    return this.forModel(ref);
  }

  /** Exact selection for background work: never fall back to another model. */
  async forModel(ref: ModelRef) {
    const entry = this.entry(ref);
    const c = this.get(entry.connectionId);
    const model = await this.build(c, entry.modelId);
    // Credential decryption can yield while another request edits the connection.
    if (JSON.stringify(this.get(c.id)) !== JSON.stringify(c))
      fail(409, "This connection changed. Try sending the message again.");
    this.entry(ref);
    return { ref, entry, providerName: describe(c.provider).name, model };
  }
}
