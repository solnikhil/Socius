import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import {
  checkUrl,
  privateAddress,
  startFilteringProxy,
} from "../src/browser/network.js";
import { redactSnapshot, splitObservation } from "../src/browser/snapshot.js";

test("private, loopback, tailnet and special addresses are never public", () => {
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "172.20.0.1",
    "192.168.1.10",
    "169.254.169.254",
    "100.101.102.103",
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fd12:3456::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "not-an-ip",
  ])
    assert.equal(privateAddress(address), true, address);
  for (const address of ["93.184.215.14", "1.1.1.1", "2606:4700::1111"])
    assert.equal(privateAddress(address), false, address);
});

test("agent navigation accepts only public http(s) addresses", () => {
  const none = new Set<string>();
  assert.equal(
    checkUrl("https://example.com/a?b=1", none).hostname,
    "example.com",
  );
  for (const url of [
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,hi",
    "chrome://settings",
    "http://localhost:3030/api/state",
    "http://app.localhost/",
    "http://127.0.0.1:3030/pair",
    "http://[::1]/",
    "http://192.168.0.1/",
    "http://printer.local/",
    "http://intranet/",
    "https://user:pass@example.com/",
    "https://laptop.tail1234.ts.net/",
    "not a url",
  ])
    assert.throws(() => checkUrl(url, none), url);
  // Test fixtures are allowed by exact host and port only.
  const fixture = new Set(["127.0.0.1:4555"]);
  assert.equal(checkUrl("http://127.0.0.1:4555/x", fixture).port, "4555");
  assert.throws(() => checkUrl("http://127.0.0.1:4556/x", fixture));
});

test("the proxy needs its credentials and refuses private destinations", async () => {
  const proxy = await startFilteringProxy();
  const port = Number(new URL(proxy.server).port);
  const send = (
    headers: Record<string, string>,
    method = "GET",
    path = "http://127.0.0.1:9/",
  ) =>
    new Promise<number>((resolve, reject) => {
      const req = request(
        { host: "127.0.0.1", port, method, path, headers },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on("connect", (res, socket) => {
        socket.destroy();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", reject);
      req.end();
    });
  const auth = {
    "Proxy-Authorization": `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString("base64")}`,
  };
  try {
    assert.equal(await send({}), 407);
    assert.equal(await send(auth), 403);
    assert.equal(await send(auth, "CONNECT", "127.0.0.1:443"), 403);
    assert.equal(await send(auth, "CONNECT", "localhost:443"), 403);
    assert.equal(await send(auth, "CONNECT", "[::1]:443"), 403);
    assert.ok(proxy.refused.includes("127.0.0.1"));
  } finally {
    await proxy.close();
  }
});

test("observations hide every form-field value, including block values", () => {
  const snapshot = [
    "- generic [ref=e1]:",
    '  - heading "Sign in" [level=1] [ref=e2]',
    "  - textbox [ref=e8]: alice",
    '  - textbox "Password" [ref=e9]: hunter2',
    '  - textbox "Code" [ref=e10]: "123456"',
    '  - textbox "Note" [ref=e11]: |',
    "      line one secret",
    "      line two secret",
    '  - searchbox "Search" [ref=e12]',
    '  - link "Next" [ref=e13]',
  ].join("\n");
  const out = redactSnapshot(snapshot, 10_000);
  for (const secret of ["alice", "hunter2", "123456", "line one", "line two"])
    assert.ok(!out.includes(secret), secret);
  assert.ok(out.includes('textbox "Password" [ref=e9]: [value hidden]'));
  assert.ok(out.includes('link "Next" [ref=e13]'));
  assert.ok(out.includes('searchbox "Search" [ref=e12]'));
  assert.ok(redactSnapshot("x".repeat(50), 10).includes("page truncated"));
});

test("rich-text editors, odd names and ref-less fields never leak content", () => {
  const out = redactSnapshot(
    [
      '- textbox "Message body" [ref=e5]:',
      "  - paragraph [ref=e6]: my private draft",
      "  - paragraph [ref=e7]: second line",
      '- textbox "Re: subject" [ref=e8]: confidential reply',
      '- textbox "Card" [ref=e9] [cursor=pointer]: 4111 1111',
      "- textbox: no ref value",
      '- heading "After" [level=2] [ref=e10]',
    ].join("\n"),
    10_000,
  );
  for (const secret of [
    "private draft",
    "second line",
    "confidential",
    "4111",
    "no ref value",
  ])
    assert.ok(!out.includes(secret), secret);
  assert.ok(out.includes('textbox "Re: subject" [ref=e8]: [value hidden]'));
  assert.ok(out.includes('heading "After"'));
});

test("observations split on line boundaries without losing lines", () => {
  const lines = Array.from(
    { length: 50 },
    (_, i) => `- link "Item ${i}" [ref=e${i}]`,
  );
  const parts = splitObservation(lines.join("\n"), 200);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 200));
  assert.deepEqual(parts.join("\n").split("\n"), lines);
  assert.deepEqual(splitObservation("", 100), [""]);
  assert.equal(splitObservation("x".repeat(500), 100)[0]!.length, 100);
});
