import type { BotInstance } from "@socius/contracts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { startRuntime, type SecretBox } from "../src/server.js";
import type { ModelRunner } from "../src/model.js";
import type {
  ActionRecord,
  ConnectorConnection,
  ExportPreview,
  InstallPreview,
  Snapshot,
} from "@socius/contracts/app";
import {
  startNotionFixture,
  type NotionFixture,
} from "../../connectors/test/fixture.js";

// Test-only reversible box standing in for OS encryption.
let failNextDecrypt = false;
const box: SecretBox = {
  encrypt: async (v) => `sealed:${Buffer.from(v).toString("base64")}`,
  decrypt: async (v) => {
    if (failNextDecrypt) {
      failNextDecrypt = false;
      throw new Error("Credential storage timed out");
    }
    return Buffer.from(v.slice(7), "base64").toString();
  },
};
const PARENT = "11111111-1111-1111-1111-111111111111";
// Deterministic model: reads with the granted tools, then proposes one page.
/** Specialist runs seen, to prove a declined ask never reaches the specialist. */
const delegatedRuns: string[] = [];
const runner: ModelRunner = async (request, onText) => {
  const text = String(request.messages.at(-1)?.content);
  if (request.briefing?.includes("asking you directly on the user's behalf"))
    delegatedRuns.push(request.bot.name);
  if (text.startsWith("delegate to researcher") && request.askBot) {
    const out = await request.askBot("Researcher", "Find the planning notes");
    onText(out);
    return out;
  }
  const tool = (name: string) =>
    request.connectorTools?.find((t) => t.name === name);
  const notes: string[] = [
    `skills:${request.skills.map((s) => s.id).join(",")}`,
  ];
  if (text.includes("brief")) {
    const skill = request.skills.find((s) => s.name === "document-brief");
    if (skill) {
      const loaded = request.loadSkill(skill.id);
      notes.push(`skill:${loaded.resources.join(",")}`);
      notes.push(
        request
          .readSkillResource(skill.id, loaded.resources[0]!)
          .split("\n")[0]!,
      );
    }
    const search = tool("notion_search");
    notes.push(
      JSON.stringify(
        search ? await search.execute({ query: "planning" }) : "no-search",
      ),
    );
    const fetchTool = tool("notion_fetch");
    if (fetchTool)
      notes.push(JSON.stringify(await fetchTool.execute({ page: PARENT })));
    const propose = tool("notion_propose_page");
    if (propose)
      notes.push(
        JSON.stringify(
          await propose.execute({
            parentPage: `https://www.notion.so/Q3-planning-${PARENT.replaceAll("-", "")}`,
            title: "Q3 brief",
            content: "## Findings\n- Ship connectors [Q3 planning]",
          }),
        ),
      );
  }
  const out = notes.join("\n");
  onText(out);
  return out;
};

async function boot(
  dir: string,
  fixture: NotionFixture,
  extra: Parameters<typeof startRuntime>[0]["broker"] = {},
  registryFetch?: typeof fetch,
) {
  const runtime = await startRuntime({
    dataDir: dir,
    runner,
    secretBox: box,
    connectorEndpoints: { "socius/notion": `${fixture.url}/mcp` },
    broker: { timeoutMs: 1000, ...extra },
    ...(registryFetch ? { registry: { fetch: registryFetch } } : {}),
  });
  const pairing = await fetch(runtime.pairingURL, { redirect: "manual" });
  const cookie = pairing.headers.get("set-cookie")!.split(";")[0]!;
  const request = (path: string, data?: unknown) =>
    fetch(`${runtime.origin}/api/${path}`, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        Cookie: cookie,
        Origin: runtime.origin,
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  const ok = async <T = unknown>(path: string, data?: unknown): Promise<T> => {
    const response = await request(path, data);
    const body = await response.json();
    assert.ok(
      response.status === 200 || response.status === 201,
      `${path}: ${response.status} ${JSON.stringify(body)}`,
    );
    return body as T;
  };
  const state = () => ok<Snapshot>("state");
  return { ...runtime, request, ok, state };
}
type Runtime = Awaited<ReturnType<typeof boot>>;

async function skillFiles(dir: string) {
  const files: { path: string; content: string }[] = [];
  async function walk(d: string) {
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else
        files.push({
          path: relative(resolve(dir, ".."), full).split(sep).join("/"),
          content: (await readFile(full)).toString("base64"),
        });
    }
  }
  await walk(dir);
  return files;
}
async function install(r: Runtime, id: string, version: string) {
  const preview = await r.ok<InstallPreview>("install/preview", {
    id,
    version,
  });
  await r.ok("install", {
    id,
    version,
    digest: preview.digest,
    consent: preview.newCapabilities,
  });
  return preview;
}
async function connect(r: Runtime) {
  const started = await r.ok<{ authorizationUrl: string; opened: boolean }>(
    "connectors/connect",
    {
      connectorId: "socius/notion",
    },
  );
  // Simulate the user approving in their browser: follow the provider redirect to Socius.
  const consent = await fetch(started.authorizationUrl, { redirect: "manual" });
  const callback = consent.headers.get("location")!;
  assert.ok(callback.startsWith(`${r.origin}/oauth/callback`));
  const page = await fetch(callback);
  assert.equal(page.status, 200, await page.clone().text());
  assert.match(await page.text(), /Connected/);
  // The one-time state cannot be replayed.
  assert.equal((await fetch(callback)).status, 400);
  return (await r.state()).connectorConnections.find(
    (c) => c.state !== "disconnected",
  )!;
}
async function setModel(r: Runtime) {
  const connection = (await (
    await r.request("providers", {
      provider: "ollama",
      config: { baseURL: "http://127.0.0.1:11434/v1" },
    })
  ).json()) as { id: string };
  const added = await r.request("models", {
    connectionId: connection.id,
    modelId: "fixture",
  });
  assert.equal(added.status, 201);
}
async function chat(r: Runtime, botId: string, content: string) {
  const response = await r.request("chat", { botId, content });
  const events = await response.text();
  assert.match(events, /"type":"done"/);
  return events;
}
/** Starts a chat whose reply waits on a review card; resolves with its stream. */
function startChat(r: Runtime, botId: string, content: string) {
  return r.request("chat", { botId, content }).then((res) => res.text());
}
async function pendingAction(r: Runtime) {
  for (let i = 0; i < 200; i++) {
    const action = (await r.state()).actions.find((a) => a.state === "pending");
    if (action) return action;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("No pending proposal appeared");
}
/** Stops the waiting reply, as the Stop button does; the proposal stays pending. */
async function stopWaiting(r: Runtime, chatting: Promise<string>) {
  const task = (await r.state()).tasks.find((t) => t.state === "running");
  if (task) await r.ok("tasks/cancel", { id: task.id });
  return chatting;
}
/**
 * Sends a chat that may propose a write. If a new review card appears, the
 * waiting reply is stopped (the card stays pending); otherwise the chat just
 * finishes. Resolves with the stream either way.
 */
async function proposeAndStop(r: Runtime, botId: string, content: string) {
  const before = new Set(
    (await r.state()).actions
      .filter((a) => a.state === "pending")
      .map((a) => a.id),
  );
  let finished = false;
  const chatting = startChat(r, botId, content).then((text) => {
    finished = true;
    return text;
  });
  for (let i = 0; i < 400 && !finished; i++) {
    const fresh = (await r.state()).actions.some(
      (a) => a.state === "pending" && !before.has(a.id),
    );
    if (fresh) return stopWaiting(r, chatting);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return chatting;
}
async function grant(
  r: Runtime,
  botId: string,
  capability: string,
  granted = true,
) {
  await r.ok("grants", { botId, capability, granted });
}

test("winning flow: import skill, connect Notion, read, approve one exact write, restart-safe", async () => {
  const fixture = await startNotionFixture();
  const dir = await mkdtemp(join(tmpdir(), "socius-connector-"));
  let r = await boot(dir, fixture);
  try {
    // 1. Import a standard skill and review its release before installing.
    const imported = await r.ok<{
      release: {
        manifest: { id: string; version: string };
        trust: string;
        source: { type: string };
      };
    }>("skills/import", {
      label: "document-brief",
      files: await skillFiles(resolve("examples/skills/document-brief")),
    });
    assert.equal(imported.release.trust, "local-unverified");
    assert.equal(imported.release.source.type, "local-import");
    const skillPreview = await r.ok<InstallPreview>("install/preview", {
      id: "local/document-brief",
      version: "1.0.0",
    });
    assert.deepEqual(skillPreview.newCapabilities, [
      "documents.read",
      "documents.write",
    ]);
    // Missing consent blocks installation.
    assert.equal(
      (
        await r.request("install", {
          id: "local/document-brief",
          version: "1.0.0",
          digest: skillPreview.digest,
        })
      ).status,
      409,
    );
    await install(r, "local/document-brief", "1.0.0");
    await install(r, "socius/notion", "0.2.0");

    // 2. Connect Notion outside chat; credentials are encrypted and never in snapshots.
    const connection = await connect(r);
    assert.equal(connection.state, "ready");
    const snapshot = JSON.stringify(await r.state());
    assert.doesNotMatch(snapshot, /access_token|refresh_token|sealed:/);
    const db = new DatabaseSync(join(dir, "socius.sqlite"));
    const sealed = db.prepare("SELECT secret FROM connector_secrets").all();
    db.close();
    assert.equal(sealed.length, 1);
    assert.match(String(sealed[0]!.secret), /^sealed:/);

    // 3. Without a grant, the bot gets no connector tools at all.
    await setModel(r);
    const main = (await r.state()).bots[0]!;
    // Installing makes the skill available to the workspace, not to any bot.
    let events = await chat(r, main.id, "Make a brief");
    assert.match(events, /skills:\\n/);
    assert.doesNotMatch(events, /brief-template/);
    await r.ok("skills/assign", {
      botId: main.id,
      skillId: "local/document-brief",
    });
    events = await chat(r, main.id, "Make a brief");
    assert.match(events, /no-search/);
    assert.match(events, /skill:references\/brief-template.md/);
    assert.match(events, /skills:local\/document-brief/);
    assert.match(events, /# Brief template/);

    // 4. Grant read + write; the bot reads permitted data and proposes one page.
    await grant(r, main.id, "documents.read");
    await grant(r, main.id, "documents.write");
    // The reply waits on the review card instead of claiming success.
    const chatting = startChat(r, main.id, "Make a brief");
    let action = await pendingAction(r);
    assert.equal(
      fixture.calls.filter((c) => c.tool === "notion-create-pages").length,
      0,
    );
    assert.equal(
      (await r.state()).tasks.find((t) => t.state === "running")?.botId,
      main.id,
    );
    assert.deepEqual(action.arguments, {
      parentPage: PARENT,
      title: "Q3 brief",
      content: "## Findings\n- Ship connectors [Q3 planning]",
    });
    assert.equal(action.actor.botId, main.id);
    assert.equal(action.release.id, "socius/notion");

    // 5. Restart while the bot waits: its reply stops, but the pending write
    // survives and still requires a matching approval.
    await r.close();
    events = await chatting;
    assert.match(events, /Q3 planning/);
    assert.match(events, /"type":"approval"/);
    assert.match(events, /still-waiting/);
    r = await boot(dir, fixture);
    action = (await r.state()).actions[0]!;
    assert.equal(action.state, "pending");
    assert.equal(
      (
        await r.request("actions/resolve", {
          id: action.id,
          digest: "0".repeat(64),
          approve: true,
        })
      ).status,
      409,
    );
    const approved = await r.ok<ActionRecord>("actions/resolve", {
      id: action.id,
      digest: action.digest,
      approve: true,
    });
    assert.equal(approved.state, "succeeded");
    assert.match(approved.result!.url!, /^https:\/\/www\.notion\.so\//);
    assert.equal(
      fixture.calls.filter((c) => c.tool === "notion-create-pages").length,
      1,
    );
    assert.ok(
      fixture.pages.some((p) => p.title === "Q3 brief" && p.parent === PARENT),
    );
    // Executes once: a second approval is refused.
    assert.equal(
      (
        await r.request("actions/resolve", {
          id: action.id,
          digest: action.digest,
          approve: true,
        })
      ).status,
      409,
    );
    const activity = (await r.state()).activity.map((a) => a.kind);
    assert.ok(activity.includes("action.succeeded"));
    assert.ok(activity.includes("connector.read"));
  } finally {
    await r.close();
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  }
});

async function proposed(r: Runtime, fixture: NotionFixture) {
  await install(r, "socius/notion", "0.2.0");
  await connect(r);
  await setModel(r);
  const main = (await r.state()).bots[0]!;
  await grant(r, main.id, "documents.read");
  await grant(r, main.id, "documents.write");
  const chatting = startChat(r, main.id, "brief please");
  const action = await pendingAction(r);
  await stopWaiting(r, chatting);
  void fixture;
  return { main, action };
}

test("the bot waits for review, then continues with the real outcome or the user's reply", async () => {
  const fixture = await startNotionFixture();
  const dir = await mkdtemp(join(tmpdir(), "socius-wait-"));
  const r = await boot(dir, fixture);
  try {
    await install(r, "socius/notion", "0.2.0");
    await connect(r);
    await setModel(r);
    const main = (await r.state()).bots[0]!;
    await grant(r, main.id, "documents.read");
    await grant(r, main.id, "documents.write");

    // Approve: the same reply resumes and reports the confirmed change.
    let chatting = startChat(r, main.id, "Make a brief");
    let action = await pendingAction(r);
    await r.ok("actions/resolve", {
      id: action.id,
      digest: action.digest,
      approve: true,
    });
    let events = await chatting;
    assert.match(events, /"type":"approval"/);
    assert.match(events, /\\"status\\":\\"done\\"/);
    assert.match(events, /"type":"done"/);
    assert.equal(
      fixture.calls.filter((c) => c.tool === "notion-create-pages").length,
      1,
    );

    // Reply instead: nothing is written and the bot receives the user's words.
    chatting = startChat(r, main.id, "Make a brief");
    action = await pendingAction(r);
    assert.equal(
      (
        await r.request("actions/resolve", {
          id: action.id,
          digest: action.digest,
          approve: true,
          feedback: "Both",
        })
      ).status,
      400,
    );
    await r.ok("actions/resolve", {
      id: action.id,
      digest: action.digest,
      approve: false,
      feedback: "Call it Q4 brief instead",
    });
    events = await chatting;
    assert.match(events, /declined-with-feedback/);
    assert.match(events, /Call it Q4 brief instead/);
    assert.equal(
      fixture.calls.filter((c) => c.tool === "notion-create-pages").length,
      1,
    );
    const declined = (await r.state()).actions.find((a) => a.id === action.id)!;
    assert.equal(declined.state, "denied");
    assert.equal(declined.feedback, "Call it Q4 brief instead");
  } finally {
    await r.close();
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("tampering, expiry, revoked grants and disabled connectors block writes", async () => {
  const fixture = await startNotionFixture();
  const dir = await mkdtemp(join(tmpdir(), "socius-broker-"));
  let now = Date.now();
  let r = await boot(dir, fixture, { now: () => now });
  try {
    const { main, action } = await proposed(r, fixture);
    // Tampering with stored arguments invalidates the binding digest.
    await r.close();
    const db = new DatabaseSync(join(dir, "socius.sqlite"));
    const row = db
      .prepare("SELECT data FROM records WHERE kind='action' AND id=?")
      .get(action.id)!;
    const tampered = JSON.parse(String(row.data));
    tampered.arguments.title = "Something else";
    db.prepare("UPDATE records SET data=? WHERE kind='action' AND id=?").run(
      JSON.stringify(tampered),
      action.id,
    );
    db.close();
    r = await boot(dir, fixture, { now: () => now });
    assert.equal(
      (
        await r.request("actions/resolve", {
          id: action.id,
          digest: action.digest,
          approve: true,
        })
      ).status,
      409,
    );

    // Expiry.
    await proposeAndStop(r, main.id, "brief again");
    let next = (await r.state()).actions.find(
      (a) => a.state === "pending" && a.id !== action.id,
    )!;
    now += 2 * 86_400_000;
    assert.equal(
      (
        await r.request("actions/resolve", {
          id: next.id,
          digest: next.digest,
          approve: true,
        })
      ).status,
      409,
    );
    assert.equal(
      (await r.state()).actions.find((a) => a.id === next.id)!.state,
      "expired",
    );
    now = Date.now();

    // Revoked bot grant blocks a pending write at execution time.
    await proposeAndStop(r, main.id, "brief three");
    next = (await r.state()).actions.find(
      (a) => a.state === "pending" && a.id !== action.id,
    )!;
    await grant(r, main.id, "documents.write", false);
    assert.equal(
      (
        await r.request("actions/resolve", {
          id: next.id,
          digest: next.digest,
          approve: true,
        })
      ).status,
      403,
    );
    assert.equal(
      (await r.state()).actions.find((a) => a.id === next.id)!.state,
      "blocked",
    );
    await grant(r, main.id, "documents.write");

    // Disabling the connector blocks pending writes and removes the tools.
    await proposeAndStop(r, main.id, "brief four");
    next = (await r.state()).actions.find(
      (a) => a.state === "pending" && a.id !== action.id,
    )!;
    await r.ok("installations/enable", { id: "socius/notion", enabled: false });
    assert.equal(
      (
        await r.request("actions/resolve", {
          id: next.id,
          digest: next.digest,
          approve: true,
        })
      ).status,
      403,
    );
    assert.match(await chat(r, main.id, "brief five"), /no-search/);
    assert.equal(
      fixture.calls.filter((c) => c.tool === "notion-create-pages").length,
      0,
    );
  } finally {
    await r.close();
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("board and delegated requests go through the same broker and are blocked after uninstall or revocation", async () => {
  const fixture = await startNotionFixture();
  const dir = await mkdtemp(join(tmpdir(), "socius-board-"));
  const r = await boot(dir, fixture);
  try {
    const { main } = await proposed(r, fixture);
    const receipt = (await r.state()).installations.find(
      (i) => i.id === "socius/notion",
    )!;
    const release = {
      id: receipt.id,
      version: receipt.version,
      digest: receipt.digest,
    };
    const boardRequest = {
      actor: {
        botId: main.id,
        taskId: "board-task-1",
        boardId: "board-1",
        runId: "run-1",
      },
      release,
      action: "notion.search",
      arguments: { query: "planning" },
    };
    const read = await r.broker.request(boardRequest);
    assert.equal(read.status, "completed");
    // Callers cannot self-grant: an unknown action or a mismatched release is refused.
    await assert.rejects(
      r.broker.request({ ...boardRequest, action: "notion.delete-everything" }),
      /Unknown action/,
    );
    await assert.rejects(
      r.broker.request({
        ...boardRequest,
        release: { ...release, digest: "0".repeat(64) },
      }),
      /release changed/,
    );
    await assert.rejects(
      r.broker.request({
        ...boardRequest,
        arguments: { query: "x", code: "rm -rf" },
      }),
      /Invalid arguments/,
    );
    // A board write parks for approval like any other.
    const write = await r.broker.request({
      ...boardRequest,
      action: "notion.create-page",
      arguments: { parentPage: PARENT, title: "Board result", content: "Done" },
    });
    assert.equal(write.status, "awaiting-approval");
    // Revoking the connection blocks reads and the pending write.
    const connection = (await r.state()).connectorConnections.find(
      (c) => c.state === "ready",
    )!;
    const disconnected = await r.ok<ConnectorConnection>(
      "connectors/disconnect",
      { connectionId: connection.id },
    );
    assert.equal(disconnected.state, "disconnected");
    assert.ok(fixture.revoked.length >= 1, "provider revocation was requested");
    await assert.rejects(r.broker.request(boardRequest), /not connected/);
    const pending = (await r.state()).actions.find(
      (a) => a.actor.boardId === "board-1",
    )!;
    assert.equal(
      (
        await r.request("actions/resolve", {
          id: pending.id,
          digest: pending.digest,
          approve: true,
        })
      ).status,
      409,
    );
    // Reconnecting creates a new account binding; old approvals stay blocked.
    await connect(r);
    assert.equal(
      (
        await r.request("actions/resolve", {
          id: pending.id,
          digest: pending.digest,
          approve: true,
        })
      ).status,
      409,
    );
    // Uninstall removes the connector and revokes its credentials.
    await r.ok("installations/uninstall", { id: "socius/notion" });
    await assert.rejects(r.broker.request(boardRequest), /not installed/);
    assert.ok(
      (await r.state()).connectorConnections.every(
        (c) => c.state === "disconnected",
      ),
    );
  } finally {
    await r.close();
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("rate limits and timeouts never trigger blind repeats; ambiguous writes are reconciled", async () => {
  const fixture = await startNotionFixture();
  const dir = await mkdtemp(join(tmpdir(), "socius-retry-"));
  const r = await boot(dir, fixture);
  const creates = () =>
    fixture.calls.filter((c) => c.tool === "notion-create-pages").length;
  try {
    const { main, action } = await proposed(r, fixture);
    // Rate limit: one attempt, failed and retryable only by the user.
    fixture.createMode = "rate-limit";
    let result = await r.ok<ActionRecord>("actions/resolve", {
      id: action.id,
      digest: action.digest,
      approve: true,
    });
    assert.equal(result.state, "failed");
    assert.equal(result.retryable, true);
    assert.equal(result.attempts.at(-1)!.outcome, "rate-limited");
    assert.equal(creates(), 1);
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(creates(), 1, "no automatic retry");
    fixture.createMode = "ok";
    result = await r.ok<ActionRecord>("actions/retry", { id: action.id });
    assert.equal(result.state, "succeeded");
    assert.equal(creates(), 2);

    // Timeout after the remote effect happened: reconciled to success, not repeated.
    await proposeAndStop(r, main.id, "brief again");
    const second = (await r.state()).actions.find(
      (a) => a.state === "pending",
    )!;
    fixture.createMode = "hang-after-create";
    result = await r.ok<ActionRecord>("actions/resolve", {
      id: second.id,
      digest: second.digest,
      approve: true,
    });
    assert.equal(result.state, "succeeded");
    assert.equal(result.attempts.length, 1);
    assert.equal(result.attempts[0]!.outcome, "succeeded");
    assert.match(result.attempts[0]!.detail!, /Confirmed by checking/);
    assert.equal(creates(), 3);
    assert.equal(
      (await r.request("actions/retry", { id: second.id })).status,
      409,
    );

    // Ambiguous with no visible effect: stays unknown, not retryable until checked.
    fixture.createMode = "ok";
    await proposeAndStop(r, main.id, "brief three");
    const third = (await r.state()).actions.find((a) => a.state === "pending")!;
    fixture.createMode = "hang-after-create";
    const before = fixture.pages.length;
    // Hide the created page from reconciliation to simulate eventual consistency.
    const originalPush = fixture.pages.push.bind(fixture.pages);
    fixture.pages.push = (...items) => {
      fixture.pages.push = originalPush;
      return before + items.length;
    };
    result = await r.ok<ActionRecord>("actions/resolve", {
      id: third.id,
      digest: third.digest,
      approve: true,
    });
    assert.equal(result.state, "unknown");
    assert.equal(result.retryable, false);
    assert.equal(
      (await r.request("actions/retry", { id: third.id })).status,
      409,
    );
    result = await r.ok<ActionRecord>("actions/check", { id: third.id });
    assert.equal(result.state, "unknown");
    assert.equal(result.retryable, true);
    fixture.createMode = "ok";
    result = await r.ok<ActionRecord>("actions/retry", { id: third.id });
    assert.equal(result.state, "succeeded");
  } finally {
    await r.close();
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("an interrupted write becomes unknown on restart and is never replayed", async () => {
  const fixture = await startNotionFixture();
  const dir = await mkdtemp(join(tmpdir(), "socius-crash-"));
  let r = await boot(dir, fixture);
  try {
    const { action } = await proposed(r, fixture);
    await r.close();
    const db = new DatabaseSync(join(dir, "socius.sqlite"));
    const row = db
      .prepare("SELECT data FROM records WHERE kind='action' AND id=?")
      .get(action.id)!;
    const record = JSON.parse(String(row.data)) as ActionRecord;
    record.state = "executing";
    record.attempts.push({
      id: "a",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      outcome: null,
      detail: null,
      baseline: null,
    });
    db.prepare("UPDATE records SET data=? WHERE kind='action' AND id=?").run(
      JSON.stringify(record),
      action.id,
    );
    db.close();
    r = await boot(dir, fixture);
    const after = (await r.state()).actions.find((a) => a.id === action.id)!;
    assert.equal(after.state, "unknown");
    assert.equal(after.retryable, false);
    assert.equal(
      fixture.calls.filter((c) => c.tool === "notion-create-pages").length,
      0,
    );
  } finally {
    await r.close();
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("connection states: unsupported without secure storage, schema drift, expired access", async () => {
  const fixture = await startNotionFixture();
  const dir = await mkdtemp(join(tmpdir(), "socius-states-"));
  const plain = await startRuntime({
    dataDir: join(dir, "plain"),
    connectorEndpoints: { "socius/notion": `${fixture.url}/mcp` },
  });
  const r = await boot(join(dir, "secure"), fixture);
  try {
    const pairing = await fetch(plain.pairingURL, { redirect: "manual" });
    const cookie = pairing.headers.get("set-cookie")!.split(";")[0]!;
    const post = (path: string, data: unknown) =>
      fetch(`${plain.origin}/api/${path}`, {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: plain.origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
    const preview = (await (
      await post("install/preview", { id: "socius/notion", version: "0.2.0" })
    ).json()) as InstallPreview;
    await post("install", {
      id: "socius/notion",
      version: "0.2.0",
      digest: preview.digest,
      consent: preview.newCapabilities,
    });
    const refused = await post("connectors/connect", {
      connectorId: "socius/notion",
    });
    assert.equal(refused.status, 409);
    assert.match(
      (await refused.json()).error,
      /OS-backed credential encryption/,
    );

    await install(r, "socius/notion", "0.2.0");
    fixture.driftSchema = true;
    const drifted = await connect(r);
    assert.equal(drifted.state, "unsupported");
    assert.match(drifted.detail, /notion-search/);
    fixture.driftSchema = false;
    assert.equal(
      (
        await r.ok<ConnectorConnection>("connectors/verify", {
          connectionId: drifted.id,
        })
      ).state,
      "ready",
    );
    fixture.revokeAll();
    const expired = await r.ok<ConnectorConnection>("connectors/verify", {
      connectionId: drifted.id,
    });
    assert.equal(expired.state, "authentication-required");
  } finally {
    await plain.close();
    await r.close();
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("skill lifecycle: integrity, immutable releases, permission expansion, disable, rollback, uninstall", async () => {
  const fixture = await startNotionFixture();
  const dir = await mkdtemp(join(tmpdir(), "socius-lifecycle-"));
  const r = await boot(dir, fixture);
  const md = (version: string, caps = "") =>
    Buffer.from(
      `---\nname: digest\ndescription: Weekly digest.\nmetadata:\n  version: ${version}\n${caps ? `  socius-capabilities: ${caps}\n` : ""}---\n\nSummarise the week.\n`,
    ).toString("base64");
  const files = (version: string, caps = "", ref = "v1") => [
    { path: "digest/SKILL.md", content: md(version, caps) },
    {
      path: "digest/references/guide.md",
      content: Buffer.from(`# Guide ${ref}`).toString("base64"),
    },
  ];
  try {
    await r.ok("skills/import", { files: files("1.0.0") });
    // Same identity with different content is refused.
    const conflict = await r.request("skills/import", {
      files: files("1.0.0", "", "changed"),
    });
    assert.equal(conflict.status, 409);
    assert.match((await conflict.json()).error, /immutable/);
    // Malformed and unsafe imports are refused with clear errors.
    for (const bad of [
      [
        {
          path: "digest/SKILL.md",
          content: Buffer.from("no frontmatter").toString("base64"),
        },
      ],
      [...files("1.0.1"), { path: "digest/../escape.md", content: "eA==" }],
      [...files("1.0.1"), { path: "digest/run.py", content: "eA==" }],
    ]) {
      const response = await r.request("skills/import", { files: bad });
      assert.equal(response.status, 400);
    }
    await install(r, "local/digest", "1.0.0");

    // Tampered files on disk fail integrity verification before activation.
    await r.ok("skills/import", {
      files: files("1.1.0", "documents.read", "v2"),
    });
    const v11 = (await r.state()).releases.find(
      (x) => x.manifest.id === "local/digest" && x.manifest.version === "1.1.0",
    )!;
    const guide = join(
      dir,
      "packages",
      "releases",
      v11.digest,
      "references",
      "guide.md",
    );
    const original = await readFile(guide);
    await writeFile(guide, "# tampered");
    const tampered = await r.ok<InstallPreview>("install/preview", {
      id: "local/digest",
      version: "1.1.0",
    });
    const failed = await r.request("install", {
      id: "local/digest",
      version: "1.1.0",
      digest: tampered.digest,
      consent: tampered.newCapabilities,
    });
    assert.equal(failed.status, 409);
    assert.match((await failed.json()).error, /integrity/);
    await writeFile(guide, original);

    // Updating to a release that requests more permissions requires fresh consent.
    const update = await r.ok<InstallPreview>("install/preview", {
      id: "local/digest",
      version: "1.1.0",
    });
    assert.deepEqual(update.newCapabilities, ["documents.read"]);
    assert.deepEqual(update.packages[0]!.installed, {
      version: "1.0.0",
      digest: update.packages[0]!.installed!.digest,
    });
    assert.equal(
      (
        await r.request("install", {
          id: "local/digest",
          version: "1.1.0",
          digest: update.digest,
          consent: [],
        })
      ).status,
      409,
    );
    await r.ok("install", {
      id: "local/digest",
      version: "1.1.0",
      digest: update.digest,
      consent: ["documents.read"],
    });
    let receipt = (await r.state()).installations.find(
      (i) => i.id === "local/digest",
    )!;
    assert.equal(receipt.version, "1.1.0");
    assert.equal(receipt.history.at(-1)!.version, "1.0.0");

    // Disabling removes the skill from bots.
    await setModel(r);
    const main = (await r.state()).bots[0]!;
    assert.doesNotMatch(await chat(r, main.id, "hello"), /local\/digest/);
    await r.ok("skills/assign", { botId: main.id, skillId: "local/digest" });
    assert.match(await chat(r, main.id, "hello"), /skills:.*local\/digest/);
    await r.ok("installations/enable", { id: "local/digest", enabled: false });
    assert.doesNotMatch(await chat(r, main.id, "hello"), /local\/digest/);
    await r.ok("installations/enable", { id: "local/digest", enabled: true });

    // Rollback restores the previous release and narrows consent. The bot stays
    // pinned to 1.1.0 and needs review instead of silently switching.
    receipt = await r.ok("installations/rollback", { id: "local/digest" });
    assert.equal((await r.state()).skillAssignments[0]!.status, "needs-review");
    assert.doesNotMatch(await chat(r, main.id, "hello"), /local\/digest/);
    assert.equal(receipt.version, "1.0.0");
    assert.deepEqual(receipt.consentedCapabilities, []);
    assert.equal(
      (await r.request("installations/rollback", { id: "local/digest" }))
        .status,
      409,
    );

    // Dependencies block uninstalling a required package.
    await install(r, "socius/researcher", "0.1.0");
    const blocked = await r.request("installations/uninstall", {
      id: "socius/research-brief",
    });
    assert.equal(blocked.status, 409);
    assert.match(
      (await blocked.json()).error,
      /Required by socius\/researcher/,
    );
    // Uninstalling an assigned skill needs confirmation to detach it.
    assert.equal(
      (await r.request("installations/uninstall", { id: "local/digest" }))
        .status,
      409,
    );
    await r.ok("installations/uninstall", { id: "local/digest", detach: true });
    assert.deepEqual((await r.state()).skillAssignments, []);
    assert.ok(
      !(await r.state()).installations.some((i) => i.id === "local/digest"),
    );

    // Skill export writes a standard directory after review.
    const preview = await r.ok<ExportPreview>("export/skill/preview", {
      id: "local/digest",
      version: "1.1.0",
    });
    assert.deepEqual(
      preview.files.map((f) => f.path),
      ["digest/SKILL.md", "digest/references/guide.md"],
    );
    const exported = await r.ok<{ path: string }>("export/skill", {
      id: "local/digest",
      version: "1.1.0",
      digest: preview.digest,
    });
    assert.match(
      await readFile(join(exported.path, "SKILL.md"), "utf8"),
      /name: digest/,
    );
  } finally {
    await r.close();
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("bot export uses an allowlist, flags private text and requires review", async () => {
  const fixture = await startNotionFixture();
  const dir = await mkdtemp(join(tmpdir(), "socius-export-"));
  const r = await boot(dir, fixture);
  try {
    const main = (await r.state()).bots[0]!;
    await r.ok("grants", { botId: main.id, memory: true });
    await r.ok("memory", {
      botId: main.id,
      content: "My manager is Priya and my salary review is in May.",
    });
    await setModel(r);
    await chat(r, main.id, "hello there");
    const draft = {
      name: "Planning helper",
      description: "Helps plan weeks.",
      role: "Planner",
      instructions:
        "Plan carefully. Email me at someone@example.com. Context: My manager is Priya and my salary review is in May.",
      version: "1.0.0",
      license: "MIT",
    };
    const preview = await r.ok<ExportPreview>("export/bot/preview", {
      botId: main.id,
      draft,
    });
    const kinds = preview.findings.map((f) => f.kind).sort();
    assert.deepEqual(kinds, ["email", "private-memory"]);
    const template = JSON.parse(preview.files[0]!.content);
    for (const forbidden of [
      "grantedCapabilities",
      "memoryNamespace",
      "messages",
      "memory",
      "routinesEnabled",
      "apiKey",
      "connections",
    ])
      assert.equal(forbidden in template, false, forbidden);
    assert.deepEqual(template.capabilities, [
      "memory.read",
      "memory.write",
      "tasks.delegate",
    ]);
    assert.doesNotMatch(preview.files[0]!.content, /hello there/);
    // Flagged text must be acknowledged; a changed draft invalidates the review.
    assert.equal(
      (
        await r.request("export/bot", {
          botId: main.id,
          draft,
          digest: preview.digest,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await r.request("export/bot", {
          botId: main.id,
          draft: { ...draft, name: "X" },
          digest: preview.digest,
          acknowledge: true,
        })
      ).status,
      409,
    );
    const clean = {
      ...draft,
      instructions: "Plan carefully from supplied context.",
    };
    const cleanPreview = await r.ok<ExportPreview>("export/bot/preview", {
      botId: main.id,
      draft: clean,
    });
    assert.deepEqual(cleanPreview.findings, []);
    const done = await r.ok<{ path: string }>("export/bot", {
      botId: main.id,
      draft: clean,
      digest: cleanPreview.digest,
    });
    const written = JSON.parse(await readFile(done.path, "utf8"));
    // The exported template imports back as an unverified local release and installs as a fresh bot.
    const imported = await r.ok<{ release: { trust: string } }>(
      "templates/import",
      { manifest: written },
    );
    assert.equal(imported.release.trust, "local-unverified");
    await install(r, "local/planning-helper", "1.0.0");
    const bots = (await r.state()).bots;
    const fresh = bots.find((b) => b.name === "Planning helper")!;
    assert.deepEqual(fresh.grantedCapabilities, []);
  } finally {
    await r.close();
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("review fixes: unreachable checks stay unknown, offline approvals fail definitely", async () => {
  const fixture = await startNotionFixture();
  const dir = await mkdtemp(join(tmpdir(), "socius-review-"));
  const r = await boot(dir, fixture);
  const creates = () =>
    fixture.calls.filter((c) => c.tool === "notion-create-pages").length;
  try {
    const { main, action } = await proposed(r, fixture);
    // Offline before the write: nothing was sent, so it is a definite, retryable failure.
    fixture.offline = true;
    let result = await r.ok<ActionRecord>("actions/resolve", {
      id: action.id,
      digest: action.digest,
      approve: true,
    });
    assert.equal(result.state, "failed");
    assert.equal(result.retryable, true);
    assert.match(result.error!, /nothing was written/);
    assert.equal(creates(), 0);
    fixture.offline = false;
    result = await r.ok<ActionRecord>("actions/retry", { id: action.id });
    assert.equal(result.state, "succeeded");
    assert.equal(creates(), 1);

    // Ambiguous write, then a check that cannot reach the service: never retryable.
    await proposeAndStop(r, main.id, "brief again");
    const second = (await r.state()).actions.find(
      (a) => a.state === "pending",
    )!;
    fixture.createMode = "hang-after-create";
    const before = fixture.pages.length;
    const originalPush = fixture.pages.push.bind(fixture.pages);
    fixture.pages.push = (...items) => {
      fixture.pages.push = originalPush;
      return before + items.length;
    };
    result = await r.ok<ActionRecord>("actions/resolve", {
      id: second.id,
      digest: second.digest,
      approve: true,
    });
    assert.equal(result.state, "unknown");
    fixture.offline = true;
    result = await r.ok<ActionRecord>("actions/check", { id: second.id });
    assert.equal(result.state, "unknown");
    assert.equal(result.retryable, false);
    assert.match(result.error!, /could not check/);
    assert.equal(
      (await r.request("actions/retry", { id: second.id })).status,
      409,
    );
    fixture.offline = false;
    fixture.createMode = "ok";
    result = await r.ok<ActionRecord>("actions/check", { id: second.id });
    assert.equal(result.retryable, true, "a check that ran and found nothing");
  } finally {
    await r.close();
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("review fixes: parallel calls share one token refresh; a decrypt failure keeps credentials", async () => {
  const fixture = await startNotionFixture();
  const dir = await mkdtemp(join(tmpdir(), "socius-race-"));
  const r = await boot(dir, fixture);
  try {
    const { main } = await proposed(r, fixture);
    const receipt = (await r.state()).installations.find(
      (i) => i.id === "socius/notion",
    )!;
    const read = (taskId: string) =>
      r.broker.request({
        actor: { botId: main.id, taskId },
        release: {
          id: receipt.id,
          version: receipt.version,
          digest: receipt.digest,
        },
        action: "notion.search",
        arguments: { query: "planning" },
      });
    // Expired access token + rotating refresh tokens + parallel tool calls.
    fixture.expireAccess();
    const results = await Promise.all([read("t1"), read("t2"), read("t3")]);
    assert.ok(results.every((x) => x.status === "completed"));
    assert.equal(
      fixture.refreshes,
      1,
      "one refresh, reused by queued sessions",
    );
    assert.equal(
      (await r.state()).connectorConnections.find(
        (c) => c.state !== "disconnected",
      )!.state,
      "ready",
    );
    // A transient decrypt failure fails that call but must not overwrite the tokens.
    failNextDecrypt = true;
    await assert.rejects(read("t4"), /could not unlock/);
    assert.equal((await read("t5")).status, "completed");
  } finally {
    failNextDecrypt = false;
    await r.close();
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("review fixes: installed exact dependencies block conflicting installs; long templates install", async () => {
  const fixture = await startNotionFixture();
  const dir = await mkdtemp(join(tmpdir(), "socius-deps-"));
  const r = await boot(dir, fixture);
  const md = (version: string) =>
    Buffer.from(
      `---\nname: digest\ndescription: Weekly digest.\nmetadata:\n  version: ${version}\n---\n\nSummarise the week.\n`,
    ).toString("base64");
  const template = (
    name: string,
    version: string,
    instructions = "Plan the week.",
  ) => ({
    schemaVersion: 1,
    id: `local/${name}`,
    version: "1.0.0",
    kind: "bot",
    name,
    description: "Test template",
    publisher: "local",
    license: "MIT",
    capabilities: [],
    dependencies: [{ id: "local/digest", version }],
    role: "Planner",
    instructions,
    modelRequirement: "tools",
  });
  try {
    for (const version of ["1.0.0", "1.1.0"])
      await r.ok("skills/import", {
        files: [{ path: "digest/SKILL.md", content: md(version) }],
      });
    await r.ok("templates/import", { manifest: template("newer", "1.1.0") });
    await r.ok("templates/import", {
      manifest: template("older", "1.0.0", "x".repeat(12000)),
    });
    await install(r, "local/newer", "1.0.0");
    const conflict = await r.request("install", {
      id: "local/older",
      version: "1.0.0",
      digest: (
        await r.ok<InstallPreview>("install/preview", {
          id: "local/older",
          version: "1.0.0",
        })
      ).digest,
      consent: [],
    });
    assert.equal(conflict.status, 409);
    assert.match(
      (await conflict.json()).error,
      /local\/newer requires local\/digest@1.1.0/,
    );
    assert.equal(
      (await r.state()).installations.find((i) => i.id === "local/digest")!
        .version,
      "1.1.0",
    );
    // Without the conflicting dependent, a 12,000-character template installs.
    await r.ok("installations/uninstall", { id: "local/newer" });
    await install(r, "local/older", "1.0.0");
    assert.ok((await r.state()).bots.some((b) => b.name === "older"));
  } finally {
    await r.close();
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("review fixes: the persisted registry cache keeps only recent pages", async () => {
  const fixture = await startNotionFixture();
  const dir = await mkdtemp(join(tmpdir(), "socius-cache-"));
  const registryFetch = (async () =>
    new Response(JSON.stringify({ servers: [] }))) as unknown as typeof fetch;
  const r = await boot(dir, fixture, {}, registryFetch);
  try {
    for (let i = 0; i < 25; i++) await r.ok(`registry?search=term${i}`);
    await r.close();
    const db = new DatabaseSync(join(dir, "socius.sqlite"));
    const rows = db
      .prepare("SELECT data FROM records WHERE kind='registry-cache'")
      .all();
    db.close();
    assert.equal(rows.length, 1);
    assert.equal(JSON.parse(String(rows[0]!.data)).entries.length, 10);
  } finally {
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("phone action approval shares the exact broker, concurrent denial cannot repeat a write, secrets stay on host", async () => {
  const { proxyRequest } = await import("./helpers.js");
  const fixture = await startNotionFixture();
  const dir = await mkdtemp(join(tmpdir(), "socius-phone-action-"));
  const r = await boot(dir, fixture);
  try {
    const { action } = await proposed(r, fixture);
    const origin = "https://laptop.tailtest.ts.net";
    await r.ok("remote/settings", { enabled: true, origin });
    const challenge = (await (await r.request("devices/pair", {})).json()) as {
      token: string;
    };
    const p = await proxyRequest(r.origin, "/api/remote/pair", origin, {
      challenge: challenge.token,
      label: "Phone",
    });
    const Cookie = p.headers.get("set-cookie")!.split(";")[0]!;
    const input = { id: action.id, digest: action.digest, approve: true };
    const headers = { Cookie, "Idempotency-Key": "phone-broker-approve-1234" };
    const outcomes = await Promise.all([
      proxyRequest(r.origin, "/api/actions/resolve", origin, input, headers),
      r.request("actions/resolve", { ...input, approve: false }),
    ]);
    assert.deepEqual(outcomes.map((x) => x.status).sort(), [200, 409]);
    assert.equal(
      (
        await proxyRequest(
          r.origin,
          "/api/actions/resolve",
          origin,
          input,
          headers,
        )
      ).status,
      outcomes[0]!.status,
    );
    assert.equal(
      fixture.calls.filter((c) => c.tool === "notion-create-pages").length,
      outcomes[0]!.status === 200 ? 1 : 0,
    );
    const state = await (
      await proxyRequest(r.origin, "/api/state", origin, undefined, { Cookie })
    ).text();
    assert.doesNotMatch(state, /access_token|refresh_token|sealed:|token_hash/);
  } finally {
    await r.close();
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("Socius cannot borrow a specialist's connected apps without the user's approval", async () => {
  const fixture = await startNotionFixture();
  const dir = await mkdtemp(join(tmpdir(), "socius-deputy-"));
  const r = await boot(dir, fixture);
  try {
    await install(r, "socius/notion", "0.2.0");
    await connect(r);
    await setModel(r);
    const researcher = await r.ok<BotInstance>("bots", {
      name: "Researcher",
      role: "Research",
      instructions: "Research.",
    });
    await grant(r, researcher.id, "documents.read");
    const main = (await r.state()).bots.find(
      (b) => b.template.id === "socius/main",
    )!;
    delegatedRuns.length = 0;

    // Declining: the specialist never runs, and Socius learns why.
    let chatting = startChat(r, main.id, "delegate to researcher");
    let ask = await pendingApproval(r, "ask");
    assert.match(ask.content, /Let Researcher use Notion to answer Socius/);
    assert.deepEqual(delegatedRuns, []);
    await r.ok("approvals", {
      id: ask.id,
      digest: ask.digest,
      approve: false,
      feedback: "Not my Notion",
    });
    let events = await chatting;
    assert.match(events, /did not let Researcher use its apps/);
    assert.match(events, /Not my Notion/);
    assert.deepEqual(delegatedRuns, []);

    // Approving: the exact request then runs with the specialist's own access.
    chatting = startChat(r, main.id, "delegate to researcher");
    ask = await pendingApproval(r, "ask");
    await r.ok("approvals", { id: ask.id, digest: ask.digest, approve: true });
    events = await chatting;
    assert.match(events, /"type":"done"/);
    assert.deepEqual(delegatedRuns, ["Researcher"]);
  } finally {
    await r.close();
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  }
});

async function pendingApproval(r: Runtime, kind: string) {
  for (let i = 0; i < 200; i++) {
    const a = (await r.state()).approvals.find(
      (x) => x.kind === kind && x.state === "pending",
    );
    if (a) return a;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`No pending ${kind} approval`);
}
