/** Shared isolation for explicit live checks. Never imported by the normal test suite. */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { homedir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/runtime/src/store.js";

/** The desktop profile that holds the user's configured provider. */
export function liveSourceProfile(): string {
  const source =
    process.env.SOCIUS_LIVE_SOURCE_PROFILE ??
    (process.platform === "darwin"
      ? join(homedir(), "Library", "Application Support", "Socius")
      : undefined);
  if (!source)
    throw new Error(
      "Set SOCIUS_LIVE_SOURCE_PROFILE to the desktop user-data directory.",
    );
  return source;
}

/**
 * Copies only the default model's provider connection (encrypted payload and
 * configuration) and model selection into an empty isolated profile. No
 * plaintext key, connectors, conversations, private memory or browser
 * session is copied. Electron decrypts the credential with OS storage.
 */
export function copySelectedProvider(
  source: string,
  profile: string,
): { provider: string; model: string } {
  const original = new DatabaseSync(
    join(source, "workspace", "socius.sqlite"),
    { readOnly: true },
  );
  const isolated = new Store(join(profile, "workspace"));
  try {
    const selected = original
      .prepare(
        "SELECT connection_id,model_id FROM model_selection WHERE scope='default'",
      )
      .get();
    assert.ok(selected, "Configure a default model in Settings first");
    const connection = original
      .prepare("SELECT * FROM provider_connections WHERE id=?")
      .get(selected.connection_id!);
    const model = original
      .prepare(
        "SELECT * FROM provider_models WHERE connection_id=? AND model_id=?",
      )
      .get(selected.connection_id!, selected.model_id!);
    assert.ok(
      connection && model,
      "Default model must have a saved provider connection",
    );
    for (const [table, row] of [
      ["provider_connections", connection],
      ["provider_models", model],
    ] as const) {
      const columns = Object.keys(row);
      isolated.db
        .prepare(
          `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
        )
        .run(...columns.map((column) => row[column]!));
    }
    isolated.db
      .prepare("INSERT INTO model_selection VALUES('default',?,?)")
      .run(selected.connection_id!, selected.model_id!);
    return {
      provider: String(connection.provider),
      model: String(selected.model_id),
    };
  } finally {
    original.close();
    isolated.close();
  }
}
