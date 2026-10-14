import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRuntime } from "../src/server.js";
import { Store } from "../src/store.js";
import type {
  Snapshot,
  Message,
  InstallPreview,
  Memory,
} from "@socius/contracts/app";
import type { ModelRunner } from "../src/model.js";

async function paired(dataDir: string, runner?: ModelRunner) {
  const runtime = await startRuntime({
    dataDir,
    ...(runner ? { runner } : {}),
  });
  const pairing = await fetch(runtime.pairingURL, { redirect: "manual" });
  const cookie = pairing.headers.get("set-cookie")!.split(";")[0]!;
  async function request(
    path: string,
    data?: unknown,
    method = data === undefined ? "GET" : "POST",
    origin = runtime.origin,
  ) {
    return fetch(`${runtime.origin}/api/${path}`, {
      method,
      headers: {
        Cookie: cookie,
        Origin: origin,
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  }
  return { ...runtime, request };
}
const fake: ModelRunner = async (request, onText) => {
  const message = request.messages.at(-1)?.content;
  if (typeof message === "string" && message.includes("create bot"))
    request.proposeBot({
      name: "Planner",
      role: "Planning specialist",
      instructions: "Make clear plans from supplied context.",
    });
  if (typeof message === "string" && message.includes("remember"))
    request.proposeMemory("I prefer concise briefs.");
  onText("A sourced response");
  return "A sourced response";
};
test("pairing is one-time and local API rejects unauthenticated/cross-origin mutations", async () => {
  const dir = await mkdtemp(join(tmpdir(), "socius-auth-"));
  const r = await paired(dir);
  try {
    assert.equal((await fetch(`${r.origin}/api/state`)).status, 401);
    assert.equal((await fetch(r.pairingURL)).status, 403);
    assert.equal(
      (
        await r.request(
          "bots",
          { name: "X", role: "Y", instructions: "Z" },
          "POST",
          "https://evil.example",
        )
      ).status,
      403,
    );
    assert.equal((await r.request("state")).status, 200);
    assert.equal(
      (
        await r.request("bots", {
          name: "X",
          role: "Y",
          instructions: "Z",
          apiKey: "secret",
        })
      ).status,
      400,
    );
  } finally {
    await r.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("reviewed installations bind the release digest, persist, and never grant permissions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "socius-install-"));
  let r = await paired(dir);
  try {
    const preview = (await (
      await r.request("install/preview", {
        id: "socius/researcher",
        version: "0.1.0",
      })
    ).json()) as InstallPreview;
    assert.equal(
      (
        await r.request("install", {
          id: "socius/researcher",
          version: "0.1.0",
          digest: "0".repeat(64),
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await r.request("install", {
          id: "socius/researcher",
          version: "0.1.0",
          digest: preview.digest,
          consent: preview.newCapabilities,
        })
      ).status,
      200,
    );
    await r.close();
    r = await paired(dir);
    const state = (await (await r.request("state")).json()) as Snapshot;
    assert.equal(state.bots.length, 2);
    assert.equal(state.installations.length, 2);
    assert.deepEqual(state.bots[1]!.grantedCapabilities, []);
    const connector = (await (
      await r.request("install/preview", {
        id: "socius/notion",
        version: "0.2.0",
      })
    ).json()) as InstallPreview;
    assert.deepEqual(connector.newCapabilities, [
      "documents.read",
      "documents.write",
    ]);
    assert.equal(
      (
        await r.request("install", {
          id: "socius/notion",
          version: "0.2.0",
          digest: connector.digest,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await r.request("install", {
          id: "socius/notion",
          version: "0.2.0",
          digest: connector.digest,
          consent: connector.newCapabilities,
        })
      ).status,
      200,
    );
    const after = (await (await r.request("state")).json()) as Snapshot;
    assert.ok(
      after.bots.every(
        (b) => !b.grantedCapabilities.includes("documents.read"),
      ),
    );
  } finally {
    await r.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("main bot proposals survive restart and create exactly one fresh specialist on approval", async () => {
  const dir = await mkdtemp(join(tmpdir(), "socius-bot-"));
  let r = await paired(dir, fake);
  try {
    let state = (await (await r.request("state")).json()) as Snapshot;
    const main = state.bots[0]!;
    await r.request("settings", {
      provider: "ollama",
      model: "test-model",
      baseURL: "http://127.0.0.1:11434/v1",
    });
    const chat = await r.request("chat", {
      botId: main.id,
      content: "create bot",
    });
    const events = await chat.text();
    assert.match(events, /"type":"done"/);
    assert.equal(
      ((await (await r.request("state")).json()) as Snapshot).bots.length,
      1,
    );
    await r.close();
    r = await paired(dir, fake);
    state = (await (await r.request("state")).json()) as Snapshot;
    const approval = state.approvals[0]!;
    assert.equal(
      (
        await r.request("approvals", {
          id: approval.id,
          digest: "0".repeat(64),
          approve: true,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await r.request("approvals", {
          id: approval.id,
          digest: approval.digest,
          approve: true,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await r.request("approvals", {
          id: approval.id,
          digest: approval.digest,
          approve: true,
        })
      ).status,
      409,
    );
    state = (await (await r.request("state")).json()) as Snapshot;
    assert.equal(state.bots.length, 2);
    assert.equal(state.bots[1]!.name, "Planner");
    assert.deepEqual(state.bots[1]!.grantedCapabilities, []);
    assert.notEqual(
      state.bots[0]!.memoryNamespace,
      state.bots[1]!.memoryNamespace,
    );
    const messages = (await (
      await r.request(`messages?botId=${main.id}`)
    ).json()) as Message[];
    assert.equal(messages[1]!.content, "A sourced response");
  } finally {
    await r.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("memory is scoped, editable on disk, indexed after edits, and removed on delete", async () => {
  const dir = await mkdtemp(join(tmpdir(), "socius-memory-"));
  const store = new Store(dir);
  try {
    const memory = store.saveMemory("bot-a", "Enjoys cricket.", "User editor");
    store.saveMemory("bot-b", "Private cricket context.", "User editor");
    assert.equal(store.searchMemory("bot-a", "cricket").length, 1);
    const path = join(store.memoryDir, `${memory.id}.md`),
      original = await readFile(path, "utf8");
    await writeFile(
      path,
      original.replace("Enjoys cricket.", "Enjoys badminton."),
    );
    assert.equal(store.searchMemory("bot-a", "cricket").length, 0);
    assert.equal(store.searchMemory("bot-a", "badminton").length, 1);
    store.deleteMemory(memory.id);
    assert.equal(store.memory("bot-a").length, 0);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("revoking memory authority blocks pending model proposals", async () => {
  const dir = await mkdtemp(join(tmpdir(), "socius-revoke-"));
  const r = await paired(dir, fake);
  try {
    const state = (await (await r.request("state")).json()) as Snapshot,
      botId = state.bots[0]!.id;
    await r.request("settings", {
      provider: "ollama",
      model: "test-model",
      baseURL: "http://127.0.0.1:11434/v1",
    });
    await r.request("grants", { botId, memory: true });
    await (await r.request("chat", { botId, content: "remember" })).text();
    const approval = ((await (await r.request("state")).json()) as Snapshot)
      .approvals[0]!;
    await r.request("grants", { botId, memory: false });
    assert.equal(
      (
        await r.request("approvals", {
          id: approval.id,
          digest: approval.digest,
          approve: true,
        })
      ).status,
      403,
    );
    assert.equal(
      ((await (await r.request(`memory?botId=${botId}`)).json()) as Memory[])
        .length,
      0,
    );
  } finally {
    await r.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("restart marks unfinished tasks failed instead of silently replaying side effects", async () => {
  const dir = await mkdtemp(join(tmpdir(), "socius-recovery-"));
  let store = new Store(dir);
  try {
    store.put("task", "unfinished", {
      id: "unfinished",
      botId: "bot-a",
      state: "running",
      error: null,
      createdAt: new Date().toISOString(),
    });
    store.close();
    store = new Store(dir);
    assert.equal(
      store.get<{ state: string }>("task", "unfinished")!.state,
      "failed",
    );
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("a bounded document summary persists the attachment and streamed result", async () => {
  const dir = await mkdtemp(join(tmpdir(), "socius-summary-"));
  let received = "";
  const runner: ModelRunner = async (request, onText) => {
    const message = request.messages.at(-1)?.content;
    assert.equal(typeof message, "string");
    received = message as string;
    onText("The report finds ");
    onText("three practical risks.");
    return "The report finds three practical risks.";
  };
  const r = await paired(dir, runner);
  try {
    const state = (await (await r.request("state")).json()) as Snapshot;
    const botId = state.bots[0]!.id;
    await r.request("settings", {
      provider: "compatible",
      model: "fixture-model",
      baseURL: "http://127.0.0.1:1234/v1",
    });
    const response = await r.request("chat", {
      botId,
      content: "Summarize this report in three points.",
      attachment: {
        name: "quarterly-report.txt",
        text: "Revenue grew 8%. Support wait time rose. Renewal risk increased.",
      },
    });
    const stream = await response.text();
    assert.match(stream, /"type":"done"/);
    assert.match(received, /quarterly-report\.txt/);
    assert.match(received, /Revenue grew 8%/);
    const messages = (await (
      await r.request(`messages?botId=${botId}`)
    ).json()) as Message[];
    assert.match(messages[0]!.content, /Support wait time rose/);
    assert.equal(messages[1]!.content, "The report finds three practical risks.");
    const after = (await (await r.request("state")).json()) as Snapshot;
    assert.equal(after.tasks[0]!.state, "completed");
  } finally {
    await r.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("memory proposals persist through restart and cannot be applied twice", async () => {
  const dir = await mkdtemp(join(tmpdir(), "socius-memory-approval-"));
  let r = await paired(dir, fake);
  try {
    const initial = (await (await r.request("state")).json()) as Snapshot;
    const botId = initial.bots[0]!.id;
    await r.request("settings", {
      provider: "compatible",
      model: "fixture-model",
      baseURL: "http://127.0.0.1:1234/v1",
    });
    await r.request("grants", { botId, memory: true });
    const chat = await r.request("chat", { botId, content: "remember this" });
    assert.match(await chat.text(), /"type":"done"/);
    await r.close();
    r = await paired(dir, fake);
    const state = (await (await r.request("state")).json()) as Snapshot;
    const approval = state.approvals[0]!;
    assert.equal(approval.state, "pending");
    assert.equal(
      (
        await r.request("approvals", {
          id: approval.id,
          digest: approval.digest,
          approve: true,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await r.request("approvals", {
          id: approval.id,
          digest: approval.digest,
          approve: true,
        })
      ).status,
      409,
    );
    const memories = (await (
      await r.request(`memory?botId=${botId}`)
    ).json()) as Memory[];
    assert.equal(memories.length, 1);
    assert.equal(memories[0]!.content, "I prefer concise briefs.");
  } finally {
    await r.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("cancellation reaches a running model and leaves an explicit cancelled task", async () => {
  const dir = await mkdtemp(join(tmpdir(), "socius-cancel-"));
  let r: Awaited<ReturnType<typeof paired>>;
  const runner: ModelRunner = (request) =>
    new Promise((_resolve, reject) => {
      request.signal.addEventListener(
        "abort",
        () => reject(new Error("cancelled")),
        { once: true },
      );
    });
  r = await paired(dir, runner);
  try {
    const initial = (await (await r.request("state")).json()) as Snapshot;
    const botId = initial.bots[0]!.id;
    await r.request("settings", {
      provider: "compatible",
      model: "fixture-model",
      baseURL: "http://127.0.0.1:1234/v1",
    });
    const response = await r.request("chat", { botId, content: "wait" });
    const reader = response.body!.getReader();
    const started = await reader.read();
    const first = JSON.parse(new TextDecoder().decode(started.value)) as {
      taskId: string;
    };
    assert.equal(
      (
        await r.request("tasks/cancel", { id: first.taskId })
      ).status,
      200,
    );
    let output = "";
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      output += new TextDecoder().decode(part.value);
    }
    assert.match(output, /"type":"error"/);
    assert.match(output, /Task cancelled or timed out/);
    const state = (await (await r.request("state")).json()) as Snapshot;
    assert.equal(state.tasks[0]!.state, "cancelled");
    assert.equal(state.tasks[0]!.error, "Task cancelled or timed out.");
  } finally {
    await r.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("provider failures are redacted, persisted, and require an explicit new run", async () => {
  const dir = await mkdtemp(join(tmpdir(), "socius-retry-"));
  let calls = 0;
  const runner: ModelRunner = async (_request, onText) => {
    calls++;
    if (calls === 1) throw new Error("secret-provider-response-body");
    onText("Recovered on explicit retry.");
    return "Recovered on explicit retry.";
  };
  const r = await paired(dir, runner);
  try {
    const initial = (await (await r.request("state")).json()) as Snapshot;
    const botId = initial.bots[0]!.id;
    await r.request("settings", {
      provider: "compatible",
      model: "fixture-model",
      baseURL: "http://127.0.0.1:1234/v1",
    });
    const failed = await r.request("chat", { botId, content: "try this" });
    const failedOutput = await failed.text();
    assert.match(failedOutput, /Model request failed/);
    assert.doesNotMatch(failedOutput, /secret-provider-response-body/);
    let state = (await (await r.request("state")).json()) as Snapshot;
    assert.equal(state.tasks[0]!.state, "failed");
    assert.doesNotMatch(JSON.stringify(state.activity), /secret-provider-response-body/);
    assert.equal(calls, 1);

    const retried = await r.request("chat", { botId, content: "try this" });
    assert.match(await retried.text(), /"type":"done"/);
    state = (await (await r.request("state")).json()) as Snapshot;
    assert.deepEqual(
      state.tasks.map((task) => task.state),
      ["failed", "completed"],
    );
    assert.equal(calls, 2);
  } finally {
    await r.close();
    await rm(dir, { recursive: true, force: true });
  }
});
