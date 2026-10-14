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
    assert.equal(Number(new URL(r.origin).port), port + 1);
    r.store.put("remote-settings", "owner", {
      enabled: true,
      origin: remote,
      configuredPort: port + 1,
    });
    await r.close();
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
    await new Promise<void>((resolve) =>
      blocker.listen(port + 1, "127.0.0.1", resolve),
    );
    r = await startRuntime({ dataDir: dir, preferredPort: port });
    assert.equal(Number(new URL(r.origin).port), port + 2);
    const p = await fetch(r.pairingURL, { redirect: "manual" });
    const Cookie = p.headers.get("set-cookie")!.split(";")[0]!;
    const s = await (
      await fetch(r.origin + "/api/remote/status", { headers: { Cookie } })
    ).json();
    assert.equal(s.needsServeUpdate, true);
    assert.match(s.serveCommand, new RegExp(`127.0.0.1:${port + 2}`));
  } finally {
    await r.close();
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
