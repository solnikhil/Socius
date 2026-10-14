import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRuntime, type SecretBox } from "../src/server.js";
import type { ModelRunner } from "../src/model.js";
import type { BotInstance } from "@socius/contracts";
import type {
  ActionRecord,
  InstallPreview,
  Snapshot,
  Task,
} from "@socius/contracts/app";
import type {
  Routine,
  RoutineNotification,
  RoutineRun,
  RoutinesSnapshot,
} from "@socius/contracts/routines";
import {
  startNotionFixture,
  type NotionFixture,
} from "../../connectors/test/fixture.js";

const box: SecretBox = {
  encrypt: async (v) => `sealed:${Buffer.from(v).toString("base64")}`,
  decrypt: async (v) => Buffer.from(v.slice(7), "base64").toString(),
};
const PARENT = "11111111-1111-1111-1111-111111111111";
// Deterministic model: in a scheduled run asked to publish, it proposes one exact page.
const runner: ModelRunner = async (request, onText) => {
  const prompt = String(request.messages.at(-1)?.content);
  let out = "Your week: ship connectors, review OAuth.";
  if (
    request.briefing?.includes("scheduled run") &&
    prompt.includes("publish")
  ) {
    const propose = request.connectorTools?.find(
      (t) => t.name === "notion_propose_page",
    );
    out = JSON.stringify(
      propose
        ? await propose.execute({
            parentPage: `https://www.notion.so/Q3-planning-${PARENT.replaceAll("-", "")}`,
            title: "Weekly plan",
            content: "- Ship connectors",
          })
        : "no tool",
    );
  }
  onText(out);
  return out;
};
async function boot(dir: string, fixture: NotionFixture) {
  const runtime = await startRuntime({
    dataDir: dir,
    env: {},
    runner,
    secretBox: box,
    connectorEndpoints: { "socius/notion": `${fixture.url}/mcp` },
    broker: { timeoutMs: 1000 },
    routines: { autoStart: false },
  });
  const pairing = await fetch(runtime.pairingURL, { redirect: "manual" });
  const cookie = pairing.headers.get("set-cookie")!.split(";")[0]!;
  const request = (
    path: string,
    data?: unknown,
    method = data === undefined ? "GET" : "POST",
    origin = runtime.origin,
  ) =>
    fetch(`${runtime.origin}/api/${path}`, {
      method,
      headers: {
        Cookie: cookie,
        Origin: origin,
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  const ok = async <T = unknown>(
    path: string,
    data?: unknown,
    status = 200,
    method?: string,
  ): Promise<T> => {
    const response = await request(path, data, method);
    const body = await response.json();
    assert.equal(response.status, status, `${path}: ${JSON.stringify(body)}`);
    return body as T;
  };
  /** One scheduler heartbeat plus the runs it started, then a settling tick. */
  const cycle = async () => {
    await runtime.routines.tick();
    await runtime.routines.idle();
    await runtime.routines.tick();
  };
  return { ...runtime, request, ok, cycle };
}
type Runtime = Awaited<ReturnType<typeof boot>>;
async function setup(r: Runtime) {
  const connection = await r.ok<{ id: string }>(
    "providers",
    { provider: "ollama", config: { baseURL: "http://127.0.0.1:11434/v1" } },
    201,
  );
  await r.ok(
    "models",
    { connectionId: connection.id, modelId: "fixture" },
    201,
  );
  const preview = await r.ok<InstallPreview>("install/preview", {
    id: "socius/notion",
    version: "0.2.0",
  });
  await r.ok("install", {
    id: "socius/notion",
    version: "0.2.0",
    digest: preview.digest,
    consent: preview.newCapabilities,
  });
  const started = await r.ok<{ authorizationUrl: string }>(
    "connectors/connect",
    { connectorId: "socius/notion" },
  );
  const consent = await fetch(started.authorizationUrl, { redirect: "manual" });
  assert.equal((await fetch(consent.headers.get("location")!)).status, 200);
}
const history = (r: Runtime, id: string) =>
  r.ok<{ runs: RoutineRun[]; notifications: RoutineNotification[] }>(
    `routines/history?id=${id}`,
  );
const actions = async (r: Runtime) => (await r.ok<Snapshot>("state")).actions;
const creates = (f: NotionFixture) =>
  f.calls.filter((c) => c.tool === "notion-create-pages").length;

test("routine API: create → preview → enable → run → approval → restart → resolve → cancel → reconcile", async () => {
  const fixture = await startNotionFixture();
  const dir = await mkdtemp(join(tmpdir(), "socius-routines-api-"));
  let r = await boot(dir, fixture);
  try {
    await setup(r);
    const planner = await r.ok<BotInstance>(
      "bots",
      {
        name: "Planner",
        role: "Plans the week",
        instructions: "Plan clearly.",
      },
      201,
    );
    for (const capability of ["documents.read", "documents.write"])
      await r.ok("grants", { botId: planner.id, capability, granted: true });

    // Validation names the field; mutations need the paired origin.
    const bad = await r.request("routines", {
      botId: planner.id,
      name: "x",
      work: { kind: "task", prompt: "x" },
      schedule: { kind: "daily", time: "8am" },
      timezone: "Asia/Kolkata",
    });
    assert.equal(bad.status, 400);
    assert.match(
      ((await bad.json()) as { error: string }).error,
      /schedule\.time: Use 24-hour HH:MM/,
    );
    const input = {
      botId: planner.id,
      name: "Weekly plan",
      work: {
        kind: "task",
        prompt: "Draft and publish my weekly plan to Notion",
      },
      schedule: { kind: "weekly", days: ["mon"], time: "08:00" },
      timezone: "Asia/Kolkata",
    };
    assert.equal(
      (await r.request("routines", input, "POST", "https://evil.example"))
        .status,
      403,
    );
    const created = await r.ok<Routine>("routines", input, 201);
    assert.equal(created.enabled, false);
    const preview = await r.ok<{
      occurrences: { key: string; local: string }[];
      notes: string[];
    }>("routines/preview", { id: created.id });
    assert.equal(preview.occurrences.length, 5);
    assert.match(preview.occurrences[0]!.key, /T08:00$/);
    assert.ok(
      preview.notes.some((n) => n.includes("only while Socius is open")),
    );
    const enabled = await r.ok<Routine>("routines/enable", {
      id: created.id,
      enabled: true,
    });
    assert.equal(enabled.enabled, true);
    assert.deepEqual(
      (
        await r.ok<BotInstance>("bots/update", {
          id: planner.id,
          name: "Planner",
        })
      ).grantedCapabilities.sort(),
      ["documents.read", "documents.write"],
    );

    // Run now: the bot proposes an exact page; nothing is written without approval.
    const queued = await r.ok<RoutineRun>(
      "routines/run",
      { id: created.id },
      202,
    );
    assert.equal(queued.state, "queued");
    assert.equal(
      (await r.request("routines/run", { id: created.id })).status,
      409,
      "no overlapping manual runs",
    );
    await r.cycle();
    let [run] = (await history(r, created.id)).runs;
    assert.equal(run!.state, "awaiting-approval");
    assert.equal(run!.actionIds.length, 1);
    let [action] = (await actions(r)).filter((a) => a.id === run!.actionIds[0]);
    assert.equal(action!.state, "pending");
    assert.equal(action!.actor.runId, `routine:${run!.id}`);
    assert.equal(action!.actor.taskId, run!.attempts[0]!.taskId);
    assert.equal(creates(fixture), 0);
    const [note] = (await history(r, created.id)).notifications;
    assert.equal(note!.kind, "approval-needed");
    assert.match(note!.body, /Create Notion page/);
    const snapshot = await r.ok<RoutinesSnapshot>("routines");
    assert.equal(snapshot.scheduler.state, "active");
    assert.equal(snapshot.notifications.length, 1);
    // A routine attempt never blocks foreground chat with the same bot.
    const chat = await r.request("chat", {
      botId: planner.id,
      content: "hello",
    });
    assert.match(await chat.text(), /"type":"done"/);

    // Restart: the run and its exact approval are still pending.
    await r.close();
    r = await boot(dir, fixture);
    await r.cycle();
    [run] = (await history(r, created.id)).runs;
    assert.equal(run!.state, "awaiting-approval");
    [action] = (await actions(r)).filter((a) => a.id === run!.actionIds[0]);
    assert.equal(action!.state, "pending");
    const resolved = await r.ok<ActionRecord>("actions/resolve", {
      id: action!.id,
      digest: action!.digest,
      approve: true,
    });
    assert.equal(resolved.state, "succeeded");
    await r.cycle();
    [run] = (await history(r, created.id)).runs;
    assert.equal(run!.state, "completed");
    assert.equal(run!.reason, "Proposed changes: 1 done.");
    assert.equal(creates(fixture), 1);

    // Approving one run is not a standing approval: the next run proposes afresh.
    await r.ok("routines/run", { id: created.id }, 202);
    await r.cycle();
    [run] = (await history(r, created.id)).runs;
    assert.equal(run!.state, "awaiting-approval");
    const second = (await actions(r)).find((a) => a.id === run!.actionIds[0])!;
    assert.notEqual(second.id, action!.id);
    assert.equal(second.state, "pending");
    // Cancelling the run blocks its pending change; approving it later fails closed.
    const cancelled = await r.ok<RoutineRun>("routines/cancel", {
      runId: run!.id,
    });
    assert.equal(cancelled.state, "cancelled");
    assert.equal(
      (await actions(r)).find((a) => a.id === second.id)!.state,
      "blocked",
    );
    assert.equal(
      (
        await r.request("actions/resolve", {
          id: second.id,
          digest: second.digest,
          approve: true,
        })
      ).status,
      409,
    );
    assert.equal(creates(fixture), 1);

    // Remote success before local acknowledgement: the write happened, then Socius died.
    await r.ok("routines/run", { id: created.id }, 202);
    await r.cycle();
    [run] = (await history(r, created.id)).runs;
    const third = (await actions(r)).find((a) => a.id === run!.actionIds[0])!;
    await r.ok("actions/resolve", {
      id: third.id,
      digest: third.digest,
      approve: true,
    });
    assert.equal(creates(fixture), 2);
    const record = r.store.get<ActionRecord>("action", third.id)!;
    const attempt = record.attempts.at(-1)!;
    r.store.put("action", third.id, {
      ...record,
      state: "executing",
      result: null,
      attempts: [
        ...record.attempts.slice(0, -1),
        { ...attempt, finishedAt: null, outcome: null },
      ],
    });
    await r.close();
    r = await boot(dir, fixture);
    await r.cycle();
    assert.equal(
      (await actions(r)).find((a) => a.id === third.id)!.state,
      "unknown",
    );
    [run] = (await history(r, created.id)).runs;
    assert.equal(run!.state, "awaiting-approval");
    assert.match(run!.reason!, /unknown outcome/);
    const checked = await r.ok<ActionRecord>("actions/check", { id: third.id });
    assert.equal(checked.state, "succeeded");
    assert.equal(creates(fixture), 2, "reconciled without replaying the write");
    await r.cycle();
    assert.equal((await history(r, created.id)).runs[0]!.state, "completed");

    // Pause and delete.
    const paused = await r.ok<Routine>("routines/enable", {
      id: created.id,
      enabled: false,
    });
    assert.equal(paused.enabled, false);
    await r.ok("routines", { id: created.id }, 200, "DELETE");
    assert.equal(
      (await r.request(`routines/history?id=${created.id}`)).status,
      404,
    );
  } finally {
    await r.close();
    await fixture.close();
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("watcher routines read only through the broker and respect current grants", async () => {
  const fixture = await startNotionFixture();
  const dir = await mkdtemp(join(tmpdir(), "socius-routines-watch-"));
  const r = await boot(dir, fixture);
  try {
    await setup(r);
    const reader = await r.ok<BotInstance>(
      "bots",
      { name: "Reader", role: "Watches pages", instructions: "Watch." },
      201,
    );
    const watcher = await r.ok<Routine>(
      "routines",
      {
        botId: reader.id,
        name: "Q3 page",
        work: {
          kind: "watcher",
          source: { action: "notion.fetch", arguments: { page: PARENT } },
        },
        schedule: { kind: "daily", time: "09:00" },
        timezone: "Europe/London",
      },
      201,
    );
    const run = async () => {
      await r.ok("routines/run", { id: watcher.id }, 202);
      await r.cycle();
      return (await history(r, watcher.id)).runs[0]!;
    };
    // No grant: a visible setup state, not an invented observation.
    let latest = await run();
    assert.equal(latest.state, "blocked");
    assert.match(latest.reason!, /has not been granted documents\.read/);
    assert.equal(
      (await history(r, watcher.id)).notifications[0]!.kind,
      "setup-needed",
    );

    await r.ok("grants", {
      botId: reader.id,
      capability: "documents.read",
      granted: true,
    });
    latest = await run();
    assert.equal(latest.state, "completed");
    assert.match(latest.result!, /baseline/);
    latest = await run();
    assert.equal(latest.result, "No change.");
    assert.equal(
      (await history(r, watcher.id)).notifications.length,
      1,
      "unchanged checks add no messages",
    );

    fixture.pages[0]!.content =
      "Goals: ship connectors. Risk: review now takes four weeks.";
    latest = await run();
    const notes = (await history(r, watcher.id)).notifications;
    assert.equal(notes.length, 2);
    assert.equal(notes.at(-1)!.kind, "change");
    // The watcher's read is attributed to its routine task.
    const task = (await r.ok<Snapshot>("state")).tasks.find(
      (t: Task) => t.id === latest.attempts[0]!.taskId,
    )!;
    assert.equal(task.routineRunId, latest.id);

    // Revoking the grant blocks the next check at the broker.
    await r.ok("grants", {
      botId: reader.id,
      capability: "documents.read",
      granted: false,
    });
    latest = await run();
    assert.equal(latest.state, "blocked");

    // Deleting the bot deletes its routines.
    await r.ok("bots", { id: reader.id }, 200, "DELETE");
    assert.equal((await r.ok<RoutinesSnapshot>("routines")).routines.length, 0);
  } finally {
    await r.close();
    await fixture.close();
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});
