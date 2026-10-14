import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

/**
 * Ordered schema migrations. Each runs once, inside a transaction, and records
 * its version. Never edit a released migration; append a new one.
 */
const migrations: { version: number; up: (db: DatabaseSync) => void }[] = [
  {
    version: 1,
    up: (db) =>
      db.exec(`
        CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,id));
        CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL, secret TEXT);
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_search USING fts5(id UNINDEXED, botId UNINDEXED, content);`),
  },
  {
    version: 2,
    up: (db) => {
      db.exec(
        `CREATE TABLE IF NOT EXISTS team_records(kind TEXT NOT NULL, id TEXT NOT NULL, board_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,id)); CREATE INDEX IF NOT EXISTS team_records_board ON team_records(board_id,kind);`,
      );
    },
  },
  {
    version: 3,
    up: (db) => {
      db.exec(
        `CREATE TABLE IF NOT EXISTS team_records(kind TEXT NOT NULL, id TEXT NOT NULL, board_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,id)); CREATE INDEX IF NOT EXISTS team_records_board ON team_records(board_id,kind);`,
      );
      if (
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='provider_connections'",
          )
          .get()
      )
        return;
      db.exec(`
        CREATE TABLE provider_connections(
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          label TEXT NOT NULL,
          config TEXT NOT NULL,
          -- OS-encrypted credential payload. 'json' holds an encrypted JSON object
          -- of secret fields; 'legacy' holds a v1 encrypted bare API key.
          secret TEXT,
          secret_format TEXT CHECK(secret_format IN ('json','legacy')),
          secret_fields TEXT NOT NULL DEFAULT '[]',
          status TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL);
        CREATE TABLE provider_models(
          connection_id TEXT NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
          model_id TEXT NOT NULL,
          label TEXT NOT NULL,
          source TEXT NOT NULL CHECK(source IN ('discovered','manual')),
          tools INTEGER,
          check_result TEXT,
          added_at TEXT NOT NULL,
          PRIMARY KEY(connection_id, model_id));
        CREATE TABLE model_discovery(
          connection_id TEXT PRIMARY KEY REFERENCES provider_connections(id) ON DELETE CASCADE,
          models TEXT NOT NULL,
          fetched_at TEXT NOT NULL);
        -- scope is 'default' or 'bot:<id>'. Removing a model clears selections that use it.
        CREATE TABLE model_selection(
          scope TEXT PRIMARY KEY,
          connection_id TEXT NOT NULL,
          model_id TEXT NOT NULL,
          FOREIGN KEY(connection_id, model_id) REFERENCES provider_models(connection_id, model_id) ON DELETE CASCADE);`);
      importLegacySettings(db);
    },
  },
  {
    version: 4,
    up: (db) => {
      // Connector credentials live outside general records and snapshots.
      db.exec(`CREATE TABLE IF NOT EXISTS connector_secrets(
        connection_id TEXT PRIMARY KEY, secret TEXT NOT NULL, updated_at TEXT NOT NULL)`);
      // Installation receipts gain lifecycle, provenance and consent fields.
      const update = db.prepare(
        "UPDATE records SET data=? WHERE kind='installation' AND id=?",
      );
      for (const row of db
        .prepare("SELECT id, data FROM records WHERE kind='installation'")
        .all()) {
        const old = JSON.parse(row.data as string) as Record<string, unknown>;
        update.run(
          JSON.stringify({
            ...old,
            enabled: old.enabled ?? true,
            source: old.source ?? { type: "bundled" },
            trust: old.trust ?? "curated",
            consentedCapabilities: old.consentedCapabilities ?? [],
            history: old.history ?? [],
          }),
          row.id as string,
        );
      }
    },
  },
  {
    version: 5,
    up: (db) =>
      db.exec(`
      CREATE TABLE devices(
        id TEXT PRIMARY KEY, label TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL, last_used_at TEXT NOT NULL, expires_at TEXT NOT NULL,
        revoked_at TEXT, origin_kind TEXT NOT NULL CHECK(origin_kind IN ('local','remote'))
      );`),
  },
  {
    version: 6,
    up: (db) =>
      db.exec(`CREATE TABLE remote_requests(
      device_id TEXT NOT NULL REFERENCES devices(id), key TEXT NOT NULL, hash TEXT NOT NULL,
      status INTEGER, result TEXT, created_at TEXT NOT NULL, PRIMARY KEY(device_id,key));`),
  },
];

/** Moves the v1 single-provider settings row into a provider connection. */
function importLegacySettings(db: DatabaseSync) {
  const row = db.prepare("SELECT data, secret FROM settings WHERE id=1").get();
  if (!row) return;
  let legacy: { provider?: string; model?: string; baseURL?: string };
  try {
    legacy = JSON.parse(row.data as string);
  } catch {
    return;
  }
  const baseURL = typeof legacy.baseURL === "string" ? legacy.baseURL : "";
  let host = "";
  try {
    host = new URL(baseURL).hostname;
  } catch {
    /* An invalid legacy endpoint is imported as-is for the user to fix. */
  }
  const mapped =
    legacy.provider === "openai" || legacy.provider === "anthropic"
      ? { provider: legacy.provider, config: {} }
      : legacy.provider === "compatible"
        ? host === "openrouter.ai"
          ? { provider: "openrouter", config: {} }
          : { provider: "openai-compatible", config: { baseURL } }
        : {
            provider: "ollama",
            config: { baseURL: baseURL || "http://127.0.0.1:11434/v1" },
          };
  const id = randomUUID(),
    now = new Date().toISOString(),
    secret = (row.secret as string | null) ?? null;
  db.prepare(
    "INSERT INTO provider_connections VALUES(?,?,?,?,?,?,?,NULL,?,?)",
  ).run(
    id,
    mapped.provider,
    "Imported connection",
    JSON.stringify(mapped.config),
    secret,
    secret ? "legacy" : null,
    JSON.stringify(secret ? ["apiKey"] : []),
    now,
    now,
  );
  const model = typeof legacy.model === "string" ? legacy.model.trim() : "";
  if (!model) return;
  db.prepare(
    "INSERT INTO provider_models VALUES(?,?,?,'manual',NULL,NULL,?)",
  ).run(id, model, model, now);
  db.prepare("INSERT INTO model_selection VALUES('default',?,?)").run(
    id,
    model,
  );
}

export const SCHEMA_VERSION = migrations.at(-1)!.version;

export function migrate(db: DatabaseSync) {
  db.exec("CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY)");
  const applied = new Set(
    db
      .prepare("SELECT version FROM migrations")
      .all()
      .map((r) => r.version as number),
  );
  const newest = Math.max(0, ...applied);
  if (newest > SCHEMA_VERSION)
    throw new Error(
      `This workspace uses schema ${newest}, newer than this Socius build supports.`,
    );
  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      m.up(db);
      db.prepare("INSERT INTO migrations VALUES(?)").run(m.version);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
