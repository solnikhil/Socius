import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../src/migrations.js";

test("routine migration upgrades a main schema-5 workspace without changing its records", () => {
  const db = new DatabaseSync(":memory:");
  try {
    migrate(db);
    // Recreate the state before routines shipped: main has already applied v5.
    for (const table of [
      "routines",
      "routine_runs",
      "routine_steps",
      "routine_state",
      "routine_notifications",
      "runtime_lease",
    ])
      db.exec(`DROP TABLE ${table}`);
    db.exec("DELETE FROM migrations WHERE version=6");
    const data = JSON.stringify({ botId: "private-bot", reason: "migration" });
    db.prepare(
      "INSERT INTO records VALUES('skill-review', 'private-bot', ?)",
    ).run(data);
    db.prepare(
      "INSERT INTO team_records VALUES('board', 'historical', 'historical', ?)",
    ).run('{"archived":true}');
    migrate(db);
    assert.ok(
      db.prepare("SELECT version FROM migrations WHERE version=6").get(),
    );
    assert.equal(
      db.prepare("SELECT data FROM records WHERE kind='skill-review'").get()
        ?.data,
      data,
    );
    assert.equal(
      db.prepare("SELECT data FROM team_records WHERE id='historical'").get()
        ?.data,
      '{"archived":true}',
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM routines").get()?.count,
      0,
    );
    migrate(db); // Upgrade is idempotent.
  } finally {
    db.close();
  }
});
