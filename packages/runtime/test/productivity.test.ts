import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { paired } from "./helpers.js";
import { startNotionFixture } from "../../connectors/test/fixture.js";
import type {
  ActionRecord,
  InstallPreview,
  Snapshot,
} from "@socius/contracts/app";

test("Linear OAuth, connector-specific grants and approval revocation cross the real MCP boundary", async () => {
  const fixture = await startNotionFixture({
    tools: {
      list_issues: { query: z.string(), limit: z.number() },
      get_issue: { id: z.string() },
      save_issue: {
        team: z.string(),
        title: z.string(),
        description: z.string(),
      },
    },
  });
  const dir = await mkdtemp(join(tmpdir(), "socius-linear-"));
  const r = await paired(dir, undefined, {
    secretBox: {
      encrypt: async (s) => `sealed:${s}`,
      decrypt: async (s) => s.slice(7),
    },
    connectorEndpoints: { "socius/linear": `${fixture.url}/mcp` },
  });
  async function post<T>(path: string, data: unknown): Promise<T> {
    const response = await r.request(path, data);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json() as Promise<T>;
  }
  try {
    const preview = await post<InstallPreview>("install/preview", {
      id: "socius/linear",
      version: "0.1.0",
    });
    await post("install", {
      id: "socius/linear",
      version: "0.1.0",
      digest: preview.digest,
      consent: preview.newCapabilities,
    });
    const { authorizationUrl } = await post<{ authorizationUrl: string }>(
      "connectors/connect",
      { connectorId: "socius/linear" },
    );
    assert.equal(
      new URL(authorizationUrl).searchParams.get("scope"),
      "read write",
    );
    const consent = await fetch(authorizationUrl, { redirect: "manual" });
    const callback = consent.headers.get("location")!;
    assert.equal((await fetch(callback)).status, 200);
    assert.equal((await fetch(callback)).status, 400);
    const snapshot = (await (await r.request("state")).json()) as Snapshot;
    const bot = snapshot.bots[0]!;
    const installed = snapshot.installations.find(
      (i) => i.id === "socius/linear",
    )!;
    const request = {
      actor: { botId: bot.id, taskId: "fixture" },
      release: {
        id: installed.id,
        version: installed.version,
        digest: installed.digest,
      },
      action: "linear.search",
      arguments: { query: "pricing" },
    };
    await post("grants", {
      botId: bot.id,
      capability: "documents.read",
      granted: true,
    });
    // A legacy Notion/global grant cannot authorize Linear.
    await assert.rejects(
      r.broker.request(request),
      /no access to this connector/,
    );
    for (const capability of ["documents.read", "documents.write"])
      await post("connectors/grants", {
        botId: bot.id,
        connectorId: "socius/linear",
        capability,
        granted: true,
      });
    const scoped = (
      (await (await r.request("state")).json()) as Snapshot
    ).bots.find((b) => b.id === bot.id)!;
    assert.equal(
      scoped.grantedCapabilities.includes("documents.write"),
      false,
      "a Linear grant must not activate legacy Notion/global document access",
    );
    assert.equal((await r.broker.request(request)).status, "completed");
    assert.equal(fixture.calls[0]!.tool, "list_issues");
    const write = await r.broker.request({
      ...request,
      action: "linear.create-issue",
      arguments: { team: "ENG", title: "Pricing", description: "Review" },
    });
    assert.equal(write.status, "awaiting-approval");
    assert.equal(fixture.calls.length, 1, "proposing does not write remotely");
    const pending = ((await (await r.request("state")).json()) as Snapshot)
      .actions[0]!;
    await post("connectors/grants", {
      botId: bot.id,
      connectorId: "socius/linear",
      capability: "documents.write",
      granted: false,
    });
    const denied = await r.request("actions/resolve", {
      id: pending.id,
      approve: true,
      digest: pending.digest,
    });
    assert.equal(denied.status, 403);
    assert.equal(fixture.calls.length, 1);
    await post("connectors/grants", {
      botId: bot.id,
      connectorId: "socius/linear",
      capability: "documents.write",
      granted: true,
    });
    await r.broker.request({
      ...request,
      action: "linear.create-issue",
      arguments: { team: "ENG", title: "Pricing", description: "Review" },
    });
    const fresh = (
      (await (await r.request("state")).json()) as Snapshot
    ).actions.find((a) => a.state === "pending")!;
    const approved = await post<ActionRecord>("actions/resolve", {
      id: fresh.id,
      approve: true,
      digest: fresh.digest,
    });
    assert.equal(approved.state, "succeeded");
    assert.deepEqual(fixture.calls.at(-1), {
      tool: "save_issue",
      args: { team: "ENG", title: "Pricing", description: "Review" },
    });
    const connection = snapshot.connectorConnections[0]!;
    await post("connectors/disconnect", { connectionId: connection.id });
    assert.equal(r.store.all("connector-grant").length, 0);
    await assert.rejects(
      r.broker.request(request),
      /no access to this connector/,
    );
  } finally {
    await r.close();
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("disconnect during OAuth token persistence cannot resurrect credentials or a ready connection", async () => {
  const { Store } = await import("../src/store.js");
  const { ConnectionService } = await import("../src/connections.js");
  const fixture = await startNotionFixture({
    tools: {
      list_issues: { query: z.string(), limit: z.number() },
      get_issue: { id: z.string() },
      save_issue: {
        team: z.string(),
        title: z.string(),
        description: z.string(),
      },
    },
  });
  const dir = await mkdtemp(join(tmpdir(), "socius-oauth-revoke-"));
  const store = new Store(dir);
  let entered!: () => void;
  let release!: () => void;
  const saving = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const service = new ConnectionService(
    store,
    {
      endpoints: { "socius/linear": `${fixture.url}/mcp` },
      secretBox: {
        encrypt: async (s) => {
          if (JSON.parse(s).tokens) {
            entered();
            await gate;
          }
          return `sealed:${s}`;
        },
        decrypt: async (s) => s.slice(7),
      },
    },
    () => "http://127.0.0.1:1",
  );
  let finishing: ReturnType<typeof service.callback> | undefined;
  try {
    const start = await service.connect("socius/linear");
    const consent = await fetch(start.authorizationUrl, { redirect: "manual" });
    finishing = service.callback(
      new URL(consent.headers.get("location")!).searchParams,
    );
    await saving;
    await service.disconnect(start.connection.id);
    release();
    assert.equal((await finishing).ok, false);
    assert.equal(service.get(start.connection.id)?.state, "disconnected");
    assert.equal(store.connectionSecret(start.connection.id), undefined);
  } finally {
    release();
    await finishing;
    await service.close();
    store.close();
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("disconnect during post-sign-in verification reports failure and stays disconnected", async () => {
  const { Store } = await import("../src/store.js");
  const { ConnectionService } = await import("../src/connections.js");
  const fixture = await startNotionFixture({
    tools: {
      list_issues: { query: z.string(), limit: z.number() },
      get_issue: { id: z.string() },
      save_issue: {
        team: z.string(),
        title: z.string(),
        description: z.string(),
      },
    },
  });
  const dir = await mkdtemp(join(tmpdir(), "socius-oauth-verify-revoke-"));
  const store = new Store(dir);
  let entered!: () => void;
  let release!: () => void;
  const verifying = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let gated = false;
  const service = new ConnectionService(
    store,
    {
      endpoints: { "socius/linear": `${fixture.url}/mcp` },
      secretBox: {
        encrypt: async (s) => `sealed:${s}`,
        // The first read of saved tokens is verification opening its session.
        decrypt: async (s) => {
          if (!gated && JSON.parse(s.slice(7)).tokens) {
            gated = true;
            entered();
            await gate;
          }
          return s.slice(7);
        },
      },
    },
    () => "http://127.0.0.1:1",
  );
  let finishing: ReturnType<typeof service.callback> | undefined;
  try {
    const start = await service.connect("socius/linear");
    const consent = await fetch(start.authorizationUrl, { redirect: "manual" });
    finishing = service.callback(
      new URL(consent.headers.get("location")!).searchParams,
    );
    await verifying;
    await service.disconnect(start.connection.id);
    release();
    const result = await finishing;
    assert.equal(result.ok, false);
    assert.match(result.message, /disconnected during sign-in/);
    assert.equal(service.get(start.connection.id)?.state, "disconnected");
    assert.equal(store.connectionSecret(start.connection.id), undefined);
  } finally {
    release();
    await finishing?.catch(() => undefined);
    await service.close();
    store.close();
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  }
});
