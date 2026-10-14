import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../src/migrations.js";

const tables = (db: DatabaseSync) =>
  (
    db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
      name: string;
    }[]
  ).map((r) => r.name);
const versions = (db: DatabaseSync) =>
  (
    db.prepare("SELECT version FROM migrations ORDER BY version").all() as {
      version: number;
    }[]
  ).map((r) => r.version);

test("a database from an early phone-pairing build upgrades instead of failing", () => {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  db.prepare("INSERT INTO records VALUES('installation','skill-1','{}')").run();
  db.prepare("INSERT INTO records VALUES('bot','bot-1','{}')").run();
  // Recreate the early build's state: devices/remote_requests recorded as 5 and 6,
  // no routine tables, no skill-review markers, nothing after 6.
  for (const t of tables(db).filter(
    (n) => n.startsWith("routine") || n === "runtime_lease",
  ))
    db.exec(`DROP TABLE ${t}`);
  db.exec("DELETE FROM records WHERE kind='skill-review'");
  db.exec("DELETE FROM migrations WHERE version > 6");

  assert.doesNotThrow(() => migrate(db));
  assert.deepEqual(versions(db), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const t of [
    "routines",
    "routine_runs",
    "routine_steps",
    "routine_state",
    "routine_notifications",
    "runtime_lease",
    "devices",
    "remote_requests",
  ])
    assert.ok(tables(db).includes(t), t);
  assert.ok(
    db
      .prepare("SELECT 1 FROM records WHERE kind='skill-review' AND id='bot-1'")
      .get(),
  );
});

test("the repair is a no-op on normal databases, so nobody reviews skills twice", () => {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  db.prepare("INSERT INTO records VALUES('installation','skill-1','{}')").run();
  db.prepare("INSERT INTO records VALUES('bot','bot-1','{}')").run();
  db.exec("DELETE FROM migrations WHERE version = 9");
  migrate(db);
  assert.deepEqual(versions(db).at(-1), 9);
  assert.equal(
    db.prepare("SELECT 1 FROM records WHERE kind='skill-review'").get(),
    undefined,
  );
});
