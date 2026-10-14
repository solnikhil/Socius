import type { DatabaseSync } from "node:sqlite";
import type {
  ConnectionStatus,
  DiscoveredModel,
  DiscoveryResult,
  ModelCheck,
  ModelEntry,
  ModelRef,
  ModelSelection,
  ProviderId,
} from "@socius/contracts/providers";

/** A connection row as stored. `secret` is ciphertext and stays in the runtime. */
export interface StoredConnection {
  id: string;
  provider: ProviderId;
  label: string;
  config: Record<string, string>;
  secret: string | null;
  secretFormat: "json" | "legacy" | null;
  secretFields: string[];
  status: ConnectionStatus | null;
  createdAt: string;
  updatedAt: string;
}

const parse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};
const toConnection = (r: Record<string, unknown>): StoredConnection => ({
  id: r.id as string,
  provider: r.provider as ProviderId,
  label: r.label as string,
  config: parse(r.config, {}),
  secret: (r.secret as string | null) ?? null,
  secretFormat: (r.secret_format as "json" | "legacy" | null) ?? null,
  secretFields: parse(r.secret_fields, []),
  status: parse(r.status, null),
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});
const toModel = (r: Record<string, unknown>): ModelEntry => ({
  connectionId: r.connection_id as string,
  modelId: r.model_id as string,
  label: r.label as string,
  source: r.source as ModelEntry["source"],
  tools: r.tools === null || r.tools === undefined ? null : r.tools === 1,
  check: parse(r.check_result, null),
  addedAt: r.added_at as string,
});

export class ProviderStore {
  constructor(private readonly db: DatabaseSync) {}

  connections(): StoredConnection[] {
    return this.db
      .prepare("SELECT * FROM provider_connections ORDER BY created_at, rowid")
      .all()
      .map(toConnection);
  }
  connection(id: string): StoredConnection | undefined {
    const row = this.db
      .prepare("SELECT * FROM provider_connections WHERE id=?")
      .get(id);
    return row ? toConnection(row) : undefined;
  }
  createConnection(c: Omit<StoredConnection, "status">) {
    this.db
      .prepare(
        "INSERT INTO provider_connections VALUES(?,?,?,?,?,?,?,NULL,?,?)",
      )
      .run(
        c.id,
        c.provider,
        c.label,
        JSON.stringify(c.config),
        c.secret,
        c.secretFormat,
        JSON.stringify(c.secretFields),
        c.createdAt,
        c.updatedAt,
      );
  }
  /** Saves edited fields. Credentials or endpoints changing invalidates checks. */
  updateConnection(
    c: Pick<
      StoredConnection,
      "id" | "label" | "config" | "secret" | "secretFormat" | "secretFields"
    >,
    invalidate: boolean,
  ) {
    this.db
      .prepare(
        `UPDATE provider_connections SET label=?, config=?, secret=?, secret_format=?, secret_fields=?, updated_at=?${invalidate ? ", status=NULL" : ""} WHERE id=?`,
      )
      .run(
        c.label,
        JSON.stringify(c.config),
        c.secret,
        c.secretFormat,
        JSON.stringify(c.secretFields),
        new Date().toISOString(),
        c.id,
      );
    if (invalidate) {
      this.db
        .prepare(
          "UPDATE provider_models SET check_result=NULL WHERE connection_id=?",
        )
        .run(c.id);
      this.db
        .prepare("DELETE FROM model_discovery WHERE connection_id=?")
        .run(c.id);
    }
  }
  deleteConnection(id: string) {
    this.db.prepare("DELETE FROM provider_connections WHERE id=?").run(id);
  }
  setStatus(id: string, status: ConnectionStatus) {
    this.db
      .prepare("UPDATE provider_connections SET status=? WHERE id=?")
      .run(JSON.stringify(status), id);
  }

  discovery(connectionId: string): DiscoveryResult | undefined {
    const row = this.db
      .prepare(
        "SELECT models, fetched_at FROM model_discovery WHERE connection_id=?",
      )
      .get(connectionId);
    return row
      ? {
          models: parse<DiscoveredModel[]>(row.models, []),
          fetchedAt: row.fetched_at as string,
        }
      : undefined;
  }
  saveDiscovery(connectionId: string, result: DiscoveryResult) {
    this.db
      .prepare(
        "INSERT INTO model_discovery VALUES(?,?,?) ON CONFLICT(connection_id) DO UPDATE SET models=excluded.models, fetched_at=excluded.fetched_at",
      )
      .run(connectionId, JSON.stringify(result.models), result.fetchedAt);
  }

  models(): ModelEntry[] {
    return this.db
      .prepare("SELECT * FROM provider_models ORDER BY added_at, rowid")
      .all()
      .map(toModel);
  }
  model(ref: ModelRef): ModelEntry | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM provider_models WHERE connection_id=? AND model_id=?",
      )
      .get(ref.connectionId, ref.modelId);
    return row ? toModel(row) : undefined;
  }
  addModel(entry: Omit<ModelEntry, "check" | "addedAt">) {
    this.db
      .prepare(
        "INSERT INTO provider_models VALUES(?,?,?,?,?,NULL,?) ON CONFLICT(connection_id, model_id) DO UPDATE SET label=excluded.label",
      )
      .run(
        entry.connectionId,
        entry.modelId,
        entry.label,
        entry.source,
        entry.tools === null ? null : entry.tools ? 1 : 0,
        new Date().toISOString(),
      );
  }
  removeModel(ref: ModelRef) {
    this.db
      .prepare(
        "DELETE FROM provider_models WHERE connection_id=? AND model_id=?",
      )
      .run(ref.connectionId, ref.modelId);
  }
  recordModelCheck(ref: ModelRef, check: ModelCheck) {
    this.db
      .prepare(
        "UPDATE provider_models SET check_result=?, tools=COALESCE(?, tools) WHERE connection_id=? AND model_id=?",
      )
      .run(
        JSON.stringify(check),
        check.tools === null ? null : check.tools ? 1 : 0,
        ref.connectionId,
        ref.modelId,
      );
  }
  setModelTools(ref: ModelRef, tools: boolean) {
    this.db
      .prepare(
        "UPDATE provider_models SET tools=? WHERE connection_id=? AND model_id=?",
      )
      .run(tools ? 1 : 0, ref.connectionId, ref.modelId);
  }

  selection(): ModelSelection {
    const selection: ModelSelection = { default: null, bots: {} };
    for (const r of this.db
      .prepare("SELECT scope, connection_id, model_id FROM model_selection")
      .all()) {
      const ref = {
        connectionId: r.connection_id as string,
        modelId: r.model_id as string,
      };
      const scope = r.scope as string;
      if (scope === "default") selection.default = ref;
      else if (scope.startsWith("bot:")) selection.bots[scope.slice(4)] = ref;
    }
    return selection;
  }
  select(scope: "default" | `bot:${string}`, ref: ModelRef | null) {
    if (!ref)
      this.db.prepare("DELETE FROM model_selection WHERE scope=?").run(scope);
    else
      this.db
        .prepare(
          "INSERT INTO model_selection VALUES(?,?,?) ON CONFLICT(scope) DO UPDATE SET connection_id=excluded.connection_id, model_id=excluded.model_id",
        )
        .run(scope, ref.connectionId, ref.modelId);
  }
  /** The model for a bot: its override, else the workspace default. */
  resolve(botId: string): ModelRef | null {
    const selection = this.selection();
    return selection.bots[botId] ?? selection.default;
  }
}
