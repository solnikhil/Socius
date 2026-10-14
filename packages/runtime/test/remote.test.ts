import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { paired, proxyRequest } from "./helpers.js";
const remote = "https://laptop.tailtest.ts.net";
test("exact remote origin is opt-in, separately paired, CSRF protected and cannot configure host secrets", async () => {
  const dir = await mkdtemp(join(tmpdir(), "socius-remote-"));
  const r = await paired(dir);
  const request = (
    path: string,
    data?: unknown,
    extra: Record<string, string> = {},
  ) => proxyRequest(r.origin, path, remote, data, extra);
  try {
    assert.equal((await request("/api/state")).status, 403);
    assert.equal(
      (
        await r.request("remote/settings", {
          enabled: true,
          origin: "https://evil.example",
        })
      ).status,
      400,
    );
    assert.equal(
      (await r.request("remote/settings", { enabled: true, origin: remote }))
        .status,
      200,
    );
    assert.equal((await request("/api/state")).status, 401);
    const c = await (await r.request("devices/pair", {})).json();
    const exchange = await request("/api/remote/pair", {
      challenge: c.token,
      label: "Phone",
    });
    assert.equal(exchange.status, 303);
    const set = exchange.headers.get("set-cookie")!;
    assert.match(set, /Secure/);
    assert.match(set, /HttpOnly/);
    const Cookie = set.split(";")[0]!;
    assert.equal(
      (await request("/api/state", undefined, { Cookie })).status,
      200,
    );
    assert.equal(
      (
        await request("/api/state", undefined, {
          Cookie,
          Origin: "https://evil.example",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request("/api/state", undefined, {
          Cookie,
          "X-Forwarded-Host": "evil.example",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request("/api/state", undefined, {
          Cookie,
          "X-Forwarded-Proto": "http",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request("/api/state", undefined, {
          Cookie,
          "X-Forwarded-For": "100.1.1.1",
          "X-Forwarded-Proto": "https",
          "X-Forwarded-Host": new URL(remote).host,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          "/api/providers",
          { provider: "openai", secrets: { apiKey: "forbidden" } },
          { Cookie },
        )
      ).status,
      403,
    );
    assert.equal(
      (await request("/api/devices/pair", {}, { Cookie })).status,
      403,
    );
    assert.equal(
      (
        await request("/api/remote/pair", {
          challenge: c.code,
          label: "Replay",
        })
      ).status,
      403,
    );
    const d = await (
      await request("/api/devices", undefined, { Cookie })
    ).json();
    assert.equal(d.devices.length, 1);
    assert.ok(!JSON.stringify(d).includes("token"));
    await r.request(`devices/${d.currentDeviceId}/revoke`, {});
    assert.equal(
      (await request("/api/state", undefined, { Cookie })).status,
      401,
    );
    await r.request("remote/settings", { enabled: false, origin: remote });
    assert.equal(
      (await request("/api/state", undefined, { Cookie })).status,
      403,
    );
  } finally {
    await r.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("Electron port fallback is remembered and a changed target is explicitly marked", async () => {
  const { createServer } = await import("node:http");
  const { startRuntime } = await import("../src/server.js");
  const dir = await mkdtemp(join(tmpdir(), "socius-port-"));
  const blocker = createServer();
  await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  const port = (blocker.address() as import("node:net").AddressInfo).port;
  let r = await startRuntime({ dataDir: dir, preferredPort: port });
  try {
    const firstPort = Number(new URL(r.origin).port);
    assert.ok(firstPort > port && firstPort <= port + 20);
    r.store.put("remote-settings", "owner", {
      enabled: true,
      origin: remote,
      configuredPort: firstPort,
    });
    await r.close();
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
    await new Promise<void>((resolve) =>
      blocker.listen(firstPort, "127.0.0.1", resolve),
    );
    r = await startRuntime({ dataDir: dir, preferredPort: port });
    const nextPort = Number(new URL(r.origin).port);
    assert.ok(nextPort > firstPort && nextPort <= firstPort + 20);
    const p = await fetch(r.pairingURL, { redirect: "manual" });
    const Cookie = p.headers.get("set-cookie")!.split(";")[0]!;
    const s = await (
      await fetch(r.origin + "/api/remote/status", { headers: { Cookie } })
    ).json();
    assert.equal(s.needsServeUpdate, true);
    assert.match(s.serveCommand, new RegExp(`127.0.0.1:${nextPort}`));
  } finally {
    await r.close();
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test("phone retries reuse tasks, authoritative recovery works and revoke cuts an active stream", async () => {
  const { connectModel } = await import("./helpers.js");
  let calls = 0;
  const dir = await mkdtemp(join(tmpdir(), "socius-retry-"));
  const r = await paired(dir, async (req, onText) => {
    calls++;
    onText("working");
    await new Promise<void>((resolve) => {
      req.signal.addEventListener("abort", () => resolve(), { once: true });
    });
    return "done";
  });
  try {
    await connectModel(r);
    await r.request("remote/settings", { enabled: true, origin: remote });
    const c = await (await r.request("devices/pair", {})).json();
    const p = await proxyRequest(r.origin, "/api/remote/pair", remote, {
      challenge: c.token,
      label: "Phone",
    });
    const Cookie = p.headers.get("set-cookie")!.split(";")[0]!;
    const key = "send-request-123456789";
    const headers = { Cookie, "Idempotency-Key": key };
    const state = await (await r.request("state")).json();
    const botId = state.bots[0].id;
    const send = await proxyRequest(
      r.origin,
      "/api/chat",
      remote,
      { botId, content: "hello" },
      headers,
    );
    const reader = send.body!.getReader();
    await reader.read();
    const replay = await proxyRequest(
      r.origin,
      "/api/chat",
      remote,
      { botId, content: "hello" },
      headers,
    );
    assert.equal(replay.status, 200);
    const receipt = await replay.json();
    assert.ok(receipt.taskId);
    assert.equal(
      (
        await proxyRequest(
          r.origin,
          "/api/chat",
          remote,
          { botId, content: "different" },
          headers,
        )
      ).status,
      409,
    );
    let snapshot = await (
      await proxyRequest(
        r.origin,
        `/api/chats/${botId}?since=ignored`,
        remote,
        undefined,
        { Cookie },
      )
    ).json();
    assert.equal(
      snapshot.messages.filter((m: any) => m.role === "user").length,
      1,
    );
    assert.equal(calls, 1);
    assert.equal(
      (
        await proxyRequest(
          r.origin,
          "/api/tasks/cancel",
          remote,
          { id: receipt.taskId },
          { Cookie },
        )
      ).status,
      400,
    );
    const cancelHeaders = {
      Cookie,
      "Idempotency-Key": "cancel-request-123456",
    };
    assert.equal(
      (
        await proxyRequest(
          r.origin,
          "/api/tasks/cancel",
          remote,
          { id: receipt.taskId },
          cancelHeaders,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await proxyRequest(
          r.origin,
          "/api/tasks/cancel",
          remote,
          { id: receipt.taskId },
          cancelHeaders,
        )
      ).status,
      200,
    );
    await reader.cancel();
    // Open another long-lived stream, then remove only its device's access.
    const second = await proxyRequest(
      r.origin,
      "/api/chat",
      remote,
      { botId, content: "second" },
      { Cookie, "Idempotency-Key": "second-request-123456" },
    );
    const stream = second.body!.getReader();
    await stream.read();
    const d = await (
      await proxyRequest(r.origin, "/api/devices", remote, undefined, {
        Cookie,
      })
    ).json();
    await r.request(`devices/${d.currentDeviceId}/revoke`, {});
    await assert.rejects(async () => {
      for (;;) {
        const n = await stream.read();
        if (n.done) throw new Error("closed");
      }
    }, /closed|aborted|terminated/i);
    assert.equal(
      (
        await proxyRequest(r.origin, "/api/state", remote, undefined, {
          Cookie,
        })
      ).status,
      401,
    );
    snapshot = await (await r.request("state")).json();
    assert.equal(
      snapshot.tasks.filter((t: any) => t.state === "running").length,
      1,
    );
    await r.request("tasks/cancel", {
      id: snapshot.tasks.find((t: any) => t.state === "running").id,
    });
  } finally {
    await r.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("exact approvals are idempotent, concurrent approve/decline has one winner, and sessions survive restart", async () => {
  const { createHash, randomUUID } = await import("node:crypto");
  const dir = await mkdtemp(join(tmpdir(), "socius-approve-phone-"));
  let r = await paired(dir);
  try {
    await r.request("remote/settings", { enabled: true, origin: remote });
    const c = await (await r.request("devices/pair", {})).json();
    const p = await proxyRequest(r.origin, "/api/remote/pair", remote, {
      challenge: c.token,
      label: "Phone",
    });
    const Cookie = p.headers.get("set-cookie")!.split(";")[0]!;
    const seed = () => {
      const bot = r.store.all<any>("bot")[0];
      const payload = {
        name: "Reviewed specialist",
        role: "Planning",
        instructions: "Plan responsibly",
      };
      const taskId = randomUUID();
      const value = { botId: bot.id, taskId, kind: "bot", payload };
      const digest = createHash("sha256")
        .update(JSON.stringify(value))
        .digest("hex");
      const id = randomUUID();
      r.store.put("approval", id, {
        ...value,
        id,
        digest,
        content: "Create specialist",
        state: "pending",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      });
      return { id, digest, approve: true };
    };
    const a = seed(),
      headers = { Cookie, "Idempotency-Key": "approve-request-123456" };
    assert.equal(
      (await proxyRequest(r.origin, "/api/approvals", remote, a, headers))
        .status,
      200,
    );
    assert.equal(
      (await proxyRequest(r.origin, "/api/approvals", remote, a, headers))
        .status,
      200,
    );
    assert.equal(r.store.all<any>("bot").length, 2);
    const race = seed();
    const outcomes = await Promise.all([
      proxyRequest(r.origin, "/api/approvals", remote, race, {
        Cookie,
        "Idempotency-Key": "race-approve-12345678",
      }),
      r.request("approvals", { ...race, approve: false }),
    ]);
    assert.deepEqual(outcomes.map((x) => x.status).sort(), [200, 409]);
    assert.ok(r.store.all<any>("bot").length <= 3);
    const snapshot = await (
      await proxyRequest(r.origin, "/api/state", remote, undefined, { Cookie })
    ).text();
    assert.ok(!snapshot.includes("token_hash"));
    assert.ok(!snapshot.includes(Cookie.split("=")[1]!));
    await r.close();
    r = await paired(dir);
    assert.equal(
      (
        await proxyRequest(r.origin, "/api/state", remote, undefined, {
          Cookie,
        })
      ).status,
      200,
    );
    // Original receipt survives restart: no second specialist appears.
    const before = r.store.all<any>("bot").length;
    assert.equal(
      (await proxyRequest(r.origin, "/api/approvals", remote, a, headers))
        .status,
      200,
    );
    assert.equal(r.store.all<any>("bot").length, before);
    await r.request("devices/revoke-remote", {});
    assert.equal(
      (
        await proxyRequest(r.origin, "/api/state", remote, undefined, {
          Cookie,
        })
      ).status,
      401,
    );
  } finally {
    await r.close();
    await rm(dir, { recursive: true, force: true });
  }
});
