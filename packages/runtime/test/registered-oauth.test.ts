import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { Store } from "../src/store.js";
import { ConnectionService } from "../src/connections.js";
import { startNotionFixture } from "../../connectors/test/fixture.js";

test("registered OAuth authenticates client, preserves scopes, refreshes and uses isolated loopback callback", async () => {
  const fixture = await startNotionFixture({
    registeredClient: { id: "registered", secret: "fixture-secret" },
    tools: {
      search_threads: { query: z.string(), pageSize: z.number() },
      get_thread: { threadId: z.string(), messageFormat: z.string() },
      create_draft: {
        to: z.array(z.string()),
        subject: z.string(),
        body: z.string(),
      },
    },
  });
  const dir = await mkdtemp(join(tmpdir(), "socius-registered-"));
  const store = new Store(dir);
  const service = new ConnectionService(
    store,
    {
      callbackPort: 0,
      env: {
        SOCIUS_GMAIL_CLIENT_ID: "registered",
        SOCIUS_GMAIL_CLIENT_SECRET: "fixture-secret",
      },
      endpoints: { "socius/gmail": `${fixture.url}/mcp` },
      secretBox: {
        encrypt: async (s) => `sealed:${s}`,
        decrypt: async (s) => s.slice(7),
      },
    },
    () => "http://127.0.0.1:1",
  );
  try {
    const started = await service.connect("socius/gmail");
    const authorization = new URL(started.authorizationUrl);
    assert.equal(authorization.searchParams.get("client_id"), "registered");
    assert.equal(authorization.searchParams.get("client_secret"), null);
    assert.equal(authorization.searchParams.get("access_type"), "offline");
    assert.equal(authorization.searchParams.get("prompt"), "consent");
    assert.match(
      authorization.searchParams.get("scope")!,
      /gmail.readonly.*gmail.compose/,
    );
    const redirect = authorization.searchParams.get("redirect_uri")!;
    assert.match(redirect, /^http:\/\/127\.0\.0\.1:\d+\/oauth\/callback$/);
    const consent = await fetch(authorization, { redirect: "manual" });
    const callback = consent.headers.get("location")!;
    assert.equal((await fetch(callback, { method: "POST" })).status, 404);
    assert.equal((await fetch(`${redirect}?state=invalid&code=x`)).status, 400);
    assert.equal((await fetch(callback)).status, 200);
    assert.equal((await fetch(callback)).status, 400);
    assert.equal(service.get(started.connection.id)?.state, "ready");
    fixture.expireAccess();
    assert.equal((await service.verify(started.connection.id)).state, "ready");
    assert.equal(fixture.refreshes, 1);
    await service.disconnect(started.connection.id);
    assert.equal(fixture.revoked.length, 1);
    assert.equal(store.connectionSecret(started.connection.id), undefined);
  } finally {
    await service.close();
    store.close();
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  }
});
