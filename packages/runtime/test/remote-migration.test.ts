import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../src/migrations.js";

test("phone migrations upgrade a schema-6 workspace while preserving routines", () => {
  const db = new DatabaseSync(":memory:");
  try {
    migrate(db);
    db.exec(
      "DROP TABLE remote_requests; DROP TABLE devices; DELETE FROM migrations WHERE version >= 7",
    );
    const data = JSON.stringify({ id: "private-routine", enabled: false });
    db.prepare("INSERT INTO routines VALUES('private-routine', 'bot', ?)").run(
      data,
    );
    migrate(db);
    assert.equal(
      db.prepare("SELECT data FROM routines WHERE id='private-routine'").get()
        ?.data,
      data,
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM devices").get()?.n, 0);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM remote_requests").get()?.n,
      0,
    );
    migrate(db);
  } finally {
    db.close();
  }
});
