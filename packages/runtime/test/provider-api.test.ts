import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { APICallError } from "ai";
import { Store } from "../src/store.js";
import type { SecretBox } from "../src/server.js";
import type { ModelRunner } from "../src/model.js";
import type { Snapshot, Task } from "@socius/contracts/app";
import type {
  ConnectionStatus,
  DiscoveryResult,
  ModelCheck,
  ProviderConnection,
} from "@socius/contracts/providers";
import { paired } from "./helpers.js";

/** Reversible stand-in for OS encryption that proves plaintext never hits disk. */
const box: SecretBox = {
  encrypt: async (v) => `enc:${Buffer.from(v).toString("base64")}`,
  decrypt: async (v) => Buffer.from(v.slice(4), "base64").toString(),
};
const KEY = "sk-live-socius-secret-key";
async function workspace<T>(
  name: string,
  fn: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), `socius-${name}-`));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
const state = async (r: Awaited<ReturnType<typeof paired>>) =>
  (await (await r.request("state")).json()) as Snapshot;

test("v1 settings migrate into a connection, model and default selection", () =>
  workspace("migrate", async (dir) => {
    const db = new DatabaseSync(join(dir, "socius.sqlite"));
    db.exec(`CREATE TABLE migrations(version INTEGER PRIMARY KEY);
      CREATE TABLE records(kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,id));
      CREATE TABLE settings(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL, secret TEXT);
      CREATE VIRTUAL TABLE memory_search USING fts5(id UNINDEXED, botId UNINDEXED, content);
      INSERT INTO migrations VALUES(1);`);
    db.prepare("INSERT INTO settings VALUES(1,?,?)").run(
      JSON.stringify({
        provider: "compatible",
        model: "anthropic/claude-x",
        baseURL: "https://openrouter.ai/api/v1",
      }),
      await box.encrypt(KEY),
    );
    db.close();
    const r = await paired(dir, undefined, { secretBox: box });
    try {
      const s = await state(r);
      assert.equal(s.connections.length, 1);
      const c = s.connections[0]!;
      assert.equal(c.provider, "openrouter");
      assert.deepEqual(c.secrets, ["apiKey"]);
      assert.deepEqual(s.selection.default, {
        connectionId: c.id,
        modelId: "anthropic/claude-x",
      });
      assert.doesNotMatch(JSON.stringify(s), /sk-live|enc:/);
      // The legacy bare-key ciphertext is still usable.
      const stored = r.store.providers.connection(c.id)!;
      assert.equal(stored.secretFormat, "legacy");
    } finally {
      await r.close();
    }
    // Reopening does not re-run the migration.
    const store = new Store(dir);
    assert.equal(store.providers.connections().length, 1);
    store.close();
  }));

test("a fresh workspace has no connection and chat explains what to set up", () =>
  workspace("fresh", async (dir) => {
    const r = await paired(dir, async () => "unused");
    try {
      const s = await state(r);
      assert.deepEqual(s.connections, []);
      assert.equal(s.selection.default, null);
      const chat = await r.request("chat", {
        botId: s.bots[0]!.id,
        content: "hi",
      });
      assert.equal(chat.status, 409);
      assert.match((await chat.json()).error, /Settings → Models/);
      assert.equal((await state(r)).tasks.length, 0);
    } finally {
      await r.close();
    }
  }));

test("connections validate fields, encrypt every credential and never return them", () =>
  workspace("connections", async (dir) => {
    const r = await paired(dir, undefined, { secretBox: box });
    try {
      const bad = [
        { provider: "nope" },
        { provider: "openai" }, // key required
        { provider: "openai", secrets: { token: KEY } },
        { provider: "openai", config: { apiKey: KEY } },
        {
          provider: "openai-compatible",
          config: { baseURL: "http://remote.example/v1" },
        },
        {
          provider: "openai-compatible",
          config: { baseURL: "https://u:p@remote.example/v1" },
        },
        { provider: "azure", secrets: { apiKey: KEY } }, // resource required
      ];
      for (const input of bad)
        assert.equal(
          (await r.request("providers", input)).status,
          400,
          JSON.stringify(input),
        );
      const created = await r.request("providers", {
        provider: "amazon-bedrock",
        label: "Work AWS",
        config: { region: "eu-west-1" },
        secrets: { accessKeyId: "AKIA-socius", secretAccessKey: KEY },
      });
      assert.equal(created.status, 201);
      const c = (await created.json()) as ProviderConnection;
      assert.deepEqual(c.secrets, ["accessKeyId", "secretAccessKey"]);
      assert.equal(c.label, "Work AWS");
      const raw = new DatabaseSync(join(dir, "socius.sqlite"))
        .prepare("SELECT * FROM provider_connections")
        .all();
      assert.doesNotMatch(JSON.stringify(raw), /sk-live|AKIA-socius/);
      assert.doesNotMatch(JSON.stringify(await state(r)), /sk-live|AKIA/);
      // Patch one secret, keep the other.
      const updated = (await (
        await r.request("providers/update", {
          id: c.id,
          secrets: { sessionToken: "temp", accessKeyId: null },
        })
      ).json()) as ProviderConnection;
      assert.deepEqual(updated.secrets, ["secretAccessKey", "sessionToken"]);
      assert.ok(r.store.providers.connection(c.id)?.secret?.startsWith("enc:"));
      assert.equal(
        (await r.request("providers", { id: c.id }, "DELETE")).status,
        200,
      );
      assert.equal((await state(r)).connections.length, 0);
    } finally {
      await r.close();
    }
  }));

test("browser mode refuses to store credentials but accepts environment keys", () =>
  workspace("browser", async (dir) => {
    const r = await paired(dir, undefined, { env: { OPENAI_API_KEY: KEY } });
    try {
      const stored = await r.request("providers", {
        provider: "anthropic",
        secrets: { apiKey: KEY },
      });
      assert.equal(stored.status, 409);
      const env = await r.request("providers", { provider: "openai" });
      assert.equal(env.status, 201);
      const c = (await env.json()) as ProviderConnection;
      assert.deepEqual(c.env, ["apiKey"]);
      assert.deepEqual(c.secrets, []);
    } finally {
      await r.close();
    }
  }));

test("changing an endpoint drops the credential saved for the old one", () =>
  workspace("endpoint", async (dir) => {
    const r = await paired(dir, undefined, { secretBox: box });
    try {
      const c = (await (
        await r.request("providers", {
          provider: "openai-compatible",
          config: { baseURL: "https://one.example/v1" },
          secrets: { apiKey: KEY },
        })
      ).json()) as ProviderConnection;
      const moved = (await (
        await r.request("providers/update", {
          id: c.id,
          config: { baseURL: "https://two.example/v1" },
        })
      ).json()) as ProviderConnection;
      assert.deepEqual(moved.secrets, []);
    } finally {
      await r.close();
    }
  }));

test("discovery, model checks, selection and chat use the chosen connection", () =>
  workspace("flow", async (dir) => {
    const calls: { url: string; auth: string | null; body: string }[] = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const auth = new Headers(init?.headers).get("authorization");
      const body = typeof init?.body === "string" ? init.body : "";
      calls.push({ url, auth, body });
      if (auth !== `Bearer ${KEY}`)
        return new Response('{"error":{"message":"Invalid key sk-echo"}}', {
          status: 401,
        });
      if (url.endsWith("/models"))
        return Response.json({
          data: [{ id: "llama-tools" }, { id: "text-embedding-x" }],
        });
      const payload = JSON.parse(body);
      const message = payload.tools
        ? {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "c",
                type: "function",
                function: { name: "socius_check", arguments: '{"value":"ok"}' },
              },
            ],
          }
        : { role: "assistant", content: "OK" };
      return Response.json({
        id: "x",
        object: "chat.completion",
        created: 1,
        model: payload.model,
        choices: [{ index: 0, message, finish_reason: "stop" }],
      });
    }) as typeof globalThis.fetch;
    let used: string[] = [];
    const runner: ModelRunner = async (req, onText) => {
      used.push(`${req.modelRef.modelId}:${req.tools}`);
      onText("ok");
      return "ok";
    };
    const r = await paired(dir, runner, { secretBox: box, fetch });
    try {
      const c = (await (
        await r.request("providers", {
          provider: "groq",
          secrets: { apiKey: KEY },
        })
      ).json()) as ProviderConnection;
      const found = (await (
        await r.request(`providers/models?id=${c.id}&refresh=1`)
      ).json()) as DiscoveryResult;
      assert.deepEqual(
        found.models.map((m) => m.id),
        ["llama-tools"],
      );
      assert.equal(calls[0]!.url, "https://api.groq.com/openai/v1/models");
      let s = await state(r);
      assert.equal(s.connections[0]!.status?.ok, true);
      assert.equal(s.connections[0]!.status?.modelCount, 1);

      assert.equal(
        (
          await r.request("models", {
            connectionId: c.id,
            modelId: "llama-tools",
          })
        ).status,
        201,
      );
      await r.request("models", {
        connectionId: c.id,
        modelId: "manual-model",
      });
      s = await state(r);
      assert.equal(s.models.length, 2);
      assert.equal(s.models[0]!.source, "discovered");
      assert.equal(s.models[1]!.source, "manual");
      // The first added model becomes the default.
      assert.equal(s.selection.default?.modelId, "llama-tools");

      const check = (await (
        await r.request("models/test", {
          connectionId: c.id,
          modelId: "llama-tools",
        })
      ).json()) as ModelCheck;
      assert.equal(check.ok, true);
      assert.equal(check.tools, true);
      assert.equal((await state(r)).models[0]!.tools, true);

      const main = s.bots[0]!;
      const specialist = (await (
        await r.request("bots", { name: "S", role: "R", instructions: "I" })
      ).json()) as { id: string };
      await r.request("models/select", {
        botId: specialist.id,
        model: { connectionId: c.id, modelId: "manual-model" },
      });
      await (await r.request("chat", { botId: main.id, content: "a" })).text();
      await (
        await r.request("chat", { botId: specialist.id, content: "b" })
      ).text();
      assert.deepEqual(used, ["llama-tools:true", "manual-model:true"]);
      const tasks = (await state(r)).tasks;
      assert.equal(tasks[1]!.model?.modelId, "manual-model");

      // Selecting an unknown model is rejected; removing a model clears its selections.
      assert.equal(
        (
          await r.request("models/select", {
            botId: null,
            model: { connectionId: c.id, modelId: "missing" },
          })
        ).status,
        404,
      );
      await r.request(
        "models",
        { connectionId: c.id, modelId: "manual-model" },
        "DELETE",
      );
      assert.deepEqual((await state(r)).selection.bots, {});
      used = [];
      await (
        await r.request("chat", { botId: specialist.id, content: "c" })
      ).text();
      assert.deepEqual(used, ["llama-tools:true"]);

      // Wrong key: classified failure, no echoed response body.
      await r.request("providers/update", {
        id: c.id,
        secrets: { apiKey: "wrong" },
      });
      const denied = await r.request("providers/test", { id: c.id });
      assert.equal(denied.status, 502);
      const deniedBody = await denied.json();
      assert.equal(deniedBody.code, "unauthorized");
      assert.doesNotMatch(JSON.stringify(deniedBody), /sk-echo/);
      const status = (await state(r)).connections[0]!
        .status as ConnectionStatus;
      assert.equal(status.ok, false);
      assert.equal(status.code, "unauthorized");
    } finally {
      await r.close();
    }
  }));

test("chat failures persist a stable code and safe message; tool rejection falls back once", () =>
  workspace("chat-errors", async (dir) => {
    let mode: "auth" | "tools" = "auth";
    const attempts: boolean[] = [];
    const runner: ModelRunner = async (req, onText) => {
      attempts.push(req.tools);
      const error = (status: number, body: string) =>
        new APICallError({
          message: body,
          url: "http://127.0.0.1:11434/v1/chat/completions",
          requestBodyValues: { messages: "private prompt" },
          statusCode: status,
          responseBody: body,
        });
      if (mode === "auth") throw error(401, "key sk-leaked is invalid");
      if (req.tools)
        throw error(400, '{"error":"model does not support tools"}');
      onText("plain answer");
      return "plain answer";
    };
    const r = await paired(dir, runner);
    try {
      const c = (await (
        await r.request("providers", { provider: "ollama" })
      ).json()) as ProviderConnection;
      await r.request("models", { connectionId: c.id, modelId: "gemma" });
      const botId = (await state(r)).bots[0]!.id;
      const failed = await (
        await r.request("chat", { botId, content: "hi" })
      ).text();
      assert.match(failed, /"code":"unauthorized"/);
      assert.doesNotMatch(failed, /sk-leaked|private prompt/);
      let task = (await state(r)).tasks[0] as Task;
      assert.equal(task.state, "failed");
      assert.equal(task.errorCode, "unauthorized");
      assert.match(task.error!, /Ollama rejected the credentials/);
      const activity = JSON.stringify((await state(r)).activity);
      assert.doesNotMatch(activity, /sk-leaked|private prompt/);

      mode = "tools";
      attempts.length = 0;
      const ok = await (
        await r.request("chat", { botId, content: "hi" })
      ).text();
      assert.match(ok, /"type":"done"/);
      assert.deepEqual(attempts, [true, false]);
      const s = await state(r);
      task = s.tasks[1] as Task;
      assert.equal(task.state, "completed");
      // The model is remembered as tool-less, so the next chat skips tools.
      assert.equal(s.models[0]!.tools, false);
      attempts.length = 0;
      await (await r.request("chat", { botId, content: "again" })).text();
      assert.deepEqual(attempts, [false]);
    } finally {
      await r.close();
    }
  }));

test("connections cannot change while a task is using them", () =>
  workspace("busy", async (dir) => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const runner: ModelRunner = async (_req, onText) => {
      await gate;
      onText("done");
      return "done";
    };
    const r = await paired(dir, runner);
    try {
      const c = (await (
        await r.request("providers", { provider: "ollama" })
      ).json()) as ProviderConnection;
      await r.request("models", { connectionId: c.id, modelId: "m" });
      const botId = (await state(r)).bots[0]!.id;
      const chat = r.request("chat", { botId, content: "hi" });
      while (!(await state(r)).tasks.some((t) => t.state === "running"))
        await new Promise((res) => setTimeout(res, 5));
      assert.equal(
        (await r.request("providers", { id: c.id }, "DELETE")).status,
        409,
      );
      assert.equal(
        (
          await r.request("providers/update", {
            id: c.id,
            config: { baseURL: "http://127.0.0.1:1/v1" },
          })
        ).status,
        409,
      );
      release();
      await (await chat).text();
      assert.equal(
        (await r.request("providers", { id: c.id }, "DELETE")).status,
        200,
      );
    } finally {
      await r.close();
    }
  }));

test("group specialists use their selected provider and lock every connection during work", () =>
  workspace("group-providers", async (dir) => {
    let entered!: () => void;
    const memberStarted = new Promise<void>((resolve) => (entered = resolve));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const seen: string[] = [];
    const r = await paired(dir, async (request) => {
      seen.push(request.modelRef.modelId);
      if (request.askMember) {
        await request.askMember("Specialist", "Help");
        return "Combined answer";
      }
      entered();
      await gate;
      return "Specialist answer";
    });
    try {
      const lead = (await (
        await r.request("providers", { provider: "ollama" })
      ).json()) as ProviderConnection;
      const member = (await (
        await r.request("providers", { provider: "lmstudio" })
      ).json()) as ProviderConnection;
      await r.request("models", {
        connectionId: lead.id,
        modelId: "lead-model",
      });
      await r.request("models", {
        connectionId: member.id,
        modelId: "member-model",
      });
      const specialist = await (
        await r.request("bots", {
          name: "Specialist",
          role: "Research",
          instructions: "Research supplied context",
        })
      ).json();
      await r.request("models/select", {
        botId: specialist.id,
        model: { connectionId: member.id, modelId: "member-model" },
      });
      const group = await (
        await r.request("groups", { memberIds: [specialist.id] })
      ).json();
      const chat = await r.request("groups/chat", {
        groupId: group.id,
        content: "Work together",
      });
      await memberStarted;
      for (const c of [lead, member]) {
        assert.equal(
          (await r.request("providers", { id: c.id }, "DELETE")).status,
          409,
        );
        assert.equal(
          (await r.request("providers/update", { id: c.id, label: "Changed" }))
            .status,
          409,
        );
      }
      release();
      assert.match(await chat.text(), /"type":"done"/);
      assert.deepEqual(seen, ["lead-model", "member-model"]);
      assert.equal((await state(r)).tasks[0]!.model!.connectionId, lead.id);
      assert.equal(
        (await r.request("providers", { id: member.id }, "DELETE")).status,
        200,
      );
    } finally {
      release();
      await r.close();
    }
  }));

test("tool rejection after a proposal never replays the task", () =>
  workspace("no-tool-replay", async (dir) => {
    let attempts = 0;
    const r = await paired(dir, async (request) => {
      attempts++;
      request.proposeBot!({
        name: "Planner",
        role: "Planning",
        instructions: "Plan",
      });
      throw new APICallError({
        message: "unsupported tools",
        url: "http://localhost",
        requestBodyValues: {},
        statusCode: 400,
        responseBody: "model does not support tools",
      });
    });
    try {
      const c = await (
        await r.request("providers", { provider: "ollama" })
      ).json();
      await r.request("models", { connectionId: c.id, modelId: "model" });
      const botId = (await state(r)).bots[0]!.id;
      const result = await (
        await r.request("chat", { botId, content: "Create a planner" })
      ).text();
      assert.match(result, /"code":"tools_unsupported"/);
      assert.equal(attempts, 1);
      assert.equal((await state(r)).approvals.length, 1);
    } finally {
      await r.close();
    }
  }));

test("connection edits reset tool capability and cannot commit after work starts during encryption", () =>
  workspace("connection-race", async (dir) => {
    let encrypted!: () => void;
    const encryptStarted = new Promise<void>(
      (resolve) => (encrypted = resolve),
    );
    let releaseEncryption!: () => void;
    const encryptionGate = new Promise<void>(
      (resolve) => (releaseEncryption = resolve),
    );
    let releaseWork!: () => void;
    const workGate = new Promise<void>((resolve) => (releaseWork = resolve));
    let started!: () => void;
    const workStarted = new Promise<void>((resolve) => (started = resolve));
    const r = await paired(
      dir,
      async () => {
        started();
        await workGate;
        return "done";
      },
      {
        secretBox: {
          ...box,
          encrypt: async (value) => {
            encrypted();
            await encryptionGate;
            return box.encrypt(value);
          },
        },
      },
    );
    try {
      const c = await (
        await r.request("providers", { provider: "ollama" })
      ).json();
      const ref = { connectionId: c.id, modelId: "model" };
      await r.request("models", ref);
      r.store.providers.setModelTools(ref, false);
      assert.equal(
        (
          await r.request("providers/update", {
            id: c.id,
            config: { baseURL: "http://127.0.0.1:1234/v1" },
          })
        ).status,
        200,
      );
      assert.equal((await state(r)).models[0]!.tools, null);
      const edit = r.request("providers/update", {
        id: c.id,
        secrets: { apiKey: "new-key" },
      });
      await encryptStarted;
      const botId = (await state(r)).bots[0]!.id;
      const chat = await r.request("chat", { botId, content: "Work" });
      await workStarted;
      releaseEncryption();
      assert.equal((await edit).status, 409);
      assert.deepEqual((await state(r)).connections[0]!.secrets, []);
      releaseWork();
      await chat.text();
    } finally {
      releaseEncryption();
      releaseWork();
      await r.close();
    }
  }));

for (const legacy of ["teams-v2", "providers-v2"] as const)
  test(`migration preserves existing ${legacy} workspaces`, () =>
    workspace(legacy, async (dir) => {
      let store = new Store(dir);
      const id = "saved-record";
      store.put("test", id, { retained: true });
      if (legacy === "teams-v2") {
        store.db.exec(
          "DROP TABLE model_selection; DROP TABLE model_discovery; DROP TABLE provider_models; DROP TABLE provider_connections;",
        );
        store.db
          .prepare("INSERT INTO team_records VALUES('board',?,'board',?)")
          .run(id, JSON.stringify({ retained: true }));
        store.db.prepare("INSERT INTO settings VALUES(1,?,NULL)").run(
          JSON.stringify({
            provider: "ollama",
            model: "legacy-model",
            baseURL: "http://127.0.0.1:11434/v1",
          }),
        );
      } else {
        store.db.exec("DROP TABLE team_records;");
      }
      store.db.exec("DELETE FROM migrations WHERE version=3;");
      store.close();
      store = new Store(dir);
      try {
        assert.deepEqual(store.get("test", id), { retained: true });
        assert.ok(
          store.db
            .prepare("SELECT name FROM sqlite_master WHERE name='team_records'")
            .get(),
        );
        assert.ok(
          store.db
            .prepare(
              "SELECT name FROM sqlite_master WHERE name='provider_connections'",
            )
            .get(),
        );
        if (legacy === "teams-v2") {
          assert.equal(store.providers.models()[0]!.modelId, "legacy-model");
          assert.ok(
            store.db.prepare("SELECT id FROM team_records WHERE id=?").get(id),
          );
        }
      } finally {
        store.close();
      }
    }));
