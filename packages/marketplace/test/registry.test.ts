import { test } from "node:test";
import assert from "node:assert/strict";
import { Catalog, mainBot, newCapabilities, reviewText, exportBotTemplate } from "../src/index.js";
import { RegistryClient, matchReview } from "../src/registry.js";

const notion = (version = "1.0.1", url = "https://mcp.notion.com/mcp") => ({
  server: {
    name: "com.notion/mcp",
    description: "Official Notion MCP server",
    version,
    remotes: [{ type: "streamable-http", url }],
  },
  _meta: { "io.modelcontextprotocol.registry/official": { status: "active", isLatest: true } },
});
function fakeFetch(pages: unknown[], seen: RequestInit[] = []) {
  let call = 0;
  return (async (_url: URL, init: RequestInit) => {
    seen.push(init);
    const page = pages[Math.min(call++, pages.length - 1)];
    if (page instanceof Error) throw page;
    if (typeof page === "number") return new Response("{}", { status: page });
    return new Response(JSON.stringify(page), { status: 200 });
  }) as unknown as typeof fetch;
}

test("registry adapter maps reviewed servers, skips malformed entries and paginates", async () => {
  const seen: RequestInit[] = [];
  const client = new RegistryClient({
    fetch: fakeFetch(
      [
        {
          servers: [
            notion(),
            notion("9.9.9"),
            { server: { name: "bad" } },
            { server: { ...notion().server, name: "io.example/unreviewed", packages: [{ registryType: "npm", identifier: "evil" }] } },
          ],
          metadata: { nextCursor: "next-page" },
        },
      ],
      seen,
    ),
  });
  const page = await client.search({ search: "notion" });
  assert.equal(page.skipped, 1);
  assert.equal(page.nextCursor, "next-page");
  assert.equal(page.servers[0]!.reviewedConnectorId, "socius/notion");
  assert.equal(page.servers[1]!.reviewedConnectorId, null, "unreviewed version");
  assert.equal(page.servers[2]!.reviewedConnectorId, null);
  assert.match(page.servers[2]!.reviewNote, /discovery only/);
  // Discovery never sends credentials or follows redirects.
  assert.equal(seen[0]!.credentials, "omit");
  assert.equal(seen[0]!.redirect, "error");
  assert.deepEqual(seen[0]!.headers, { Accept: "application/json" });
});

test("a review only matches the exact reviewed release and endpoint", () => {
  assert.ok(matchReview({ name: "com.notion/mcp", version: "1.0.1", remotes: [{ type: "streamable-http", url: "https://mcp.notion.com/mcp" }] }));
  assert.equal(matchReview({ name: "com.notion/mcp", version: "1.0.1", remotes: [{ type: "streamable-http", url: "https://evil.example/mcp" }] }), undefined);
  assert.equal(matchReview({ name: "com.notion/mcp", version: "1.0.1", remotes: [{ type: "sse", url: "https://mcp.notion.com/mcp" }] }), undefined);
});

test("registry failures fall back to stale cache or report an error", async () => {
  const client = new RegistryClient({ ttlMs: 0, fetch: fakeFetch([{ servers: [notion()] }, 503, 429, new Error("offline")]) });
  assert.equal((await client.search()).servers.length, 1);
  const stale = await client.search();
  assert.equal(stale.stale, true);
  assert.match(stale.error!, /HTTP 503/);
  assert.equal(stale.servers.length, 1);
  assert.match((await client.search()).error!, /rate limit/);
  const empty = await new RegistryClient({ fetch: fakeFetch([new Error("offline")]) }).search();
  assert.equal(empty.servers.length, 0);
  assert.match(empty.error!, /failed/);
  const shape = await new RegistryClient({ fetch: fakeFetch([{ nope: true }]) }).search();
  assert.match(shape.error!, /unexpected shape/);
});

test("fresh cache entries avoid repeat network calls", async () => {
  const seen: RequestInit[] = [];
  const client = new RegistryClient({ fetch: fakeFetch([{ servers: [] }], seen) });
  await client.search({ search: "a" });
  await client.search({ search: "a" });
  assert.equal(seen.length, 1);
});

test("incompatible releases cannot be planned and new capabilities are computed against consent", () => {
  const future = { ...mainBot, id: "test/future", minRuntime: "9.0.0" };
  const catalog = new Catalog([future]);
  assert.equal(catalog.releases()[0]!.compatible, false);
  assert.throws(() => catalog.planInstall("test/future", "0.1.0"), /Requires Socius 9.0.0/);
  assert.deepEqual(newCapabilities(["memory.read", "documents.write"], ["memory.read"]), ["documents.write"]);
});

test("review flags emails, phones, URLs, secrets, paths and copied private memory", () => {
  const findings = reviewText(
    {
      instructions:
        "Mail a@b.co or call +1 415 555 0100. See https://x.example/a. key sk-abcdefghijklmnop123 and C:\\Users\\alex\\notes. I live in Pune near the lake.",
    },
    ["I live in Pune near the lake."],
  );
  assert.deepEqual([...new Set(findings.map((f) => f.kind))].sort(), ["email", "path", "phone", "private-memory", "secret", "url"]);
  assert.deepEqual(reviewText({ instructions: "Plan the week from supplied notes." }), []);
});

test("template export keeps requested capabilities only and drops absent dependencies", () => {
  const manifest = exportBotTemplate(
    { name: "Helper", description: "d", role: "r", instructions: "i", version: "1.0.0", license: "MIT" },
    { ...mainBot, dependencies: [{ id: "socius/research-brief", version: "0.1.0" }] },
    [],
  );
  assert.equal(manifest.id, "local/helper");
  assert.deepEqual(manifest.dependencies, []);
  assert.deepEqual(manifest.capabilities, mainBot.capabilities);
  assert.throws(() =>
    exportBotTemplate({ name: "H", description: "d", role: "r", instructions: "i", version: "1", license: "MIT" }, undefined, []),
  );
});
