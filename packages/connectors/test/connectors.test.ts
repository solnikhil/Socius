import { test } from "node:test";
import assert from "node:assert/strict";
import { curatedCatalog } from "@socius/marketplace/curated";
import type { ConnectorManifest } from "@socius/contracts";
import {
  checkToolSchemas,
  classifyError,
  notion,
  notionPageId,
  verifyManifest,
} from "../src/index.js";
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

const curated = curatedCatalog.find((p) => p.id === "socius/notion") as ConnectorManifest;

test("the curated Notion manifest matches the reviewed runtime actions", () => {
  assert.deepEqual(verifyManifest(curated), []);
  assert.match(verifyManifest({ ...curated, tools: [...curated.tools!, { id: "notion.delete", access: "write", capability: "documents.write", description: "x" }] }).join(), /declared but not implemented/);
  assert.match(verifyManifest({ ...curated, capabilities: ["documents.read"] }).join(), /undeclared documents.write/);
  assert.match(verifyManifest({ ...curated, upstream: { ...curated.upstream!, remoteUrl: "https://evil.example/mcp" } }).join(), /upstream URL/);
  assert.match(verifyManifest({ ...curated, id: "socius/other" }).join(), /no reviewed runtime/);
});

test("page references accept IDs and Notion URLs only", () => {
  const id = "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d";
  assert.equal(notionPageId(id.replaceAll("-", "")), id);
  assert.equal(notionPageId(id.toUpperCase()), id);
  assert.equal(notionPageId(`https://www.notion.so/team/My-Page-${id.replaceAll("-", "")}`), id);
  assert.equal(notionPageId(`https://evil.example/${id.replaceAll("-", "")}`), null);
  assert.equal(notionPageId(`http://www.notion.so/${id.replaceAll("-", "")}`), null);
  assert.equal(notionPageId("../../etc"), null);
});

test("write arguments are validated and normalized before binding an approval", () => {
  const create = notion.actions.find((a) => a.id === "notion.create-page")!;
  assert.equal(create.access, "write");
  assert.equal(create.input.safeParse({ parentPage: "x", title: "t", content: "c" }).success, false);
  assert.equal(create.input.safeParse({ parentPage: "1".repeat(32), title: "two\nlines", content: "c" }).success, false);
  assert.equal(create.input.safeParse({ parentPage: "1".repeat(32), title: "t", content: "c", extra: 1 }).success, false);
  const parsed = create.input.parse({ parentPage: "1".repeat(32), title: " t ", content: "c" });
  assert.deepEqual(parsed, { parentPage: "11111111-1111-1111-1111-111111111111", title: "t", content: "c" });
});

test("upstream schema drift is detected", () => {
  const tools = [
    { name: "notion-search", inputSchema: { properties: { query: {} } } },
    { name: "notion-fetch", inputSchema: { properties: { id: {} } } },
    { name: "notion-create-pages", inputSchema: { properties: { parent: {}, pages: {} } } },
  ];
  assert.equal(checkToolSchemas(notion, tools), null);
  assert.match(checkToolSchemas(notion, tools.slice(1))!, /no longer offers/);
  assert.match(checkToolSchemas(notion, [tools[0]!, tools[1]!, { name: "notion-create-pages", inputSchema: { properties: { pages: {} } } }])!, /parent/);
});

test("failures are classified by what they prove about the remote effect", () => {
  assert.equal(classifyError(new StreamableHTTPError(429, "slow down")).kind, "rate-limited");
  assert.equal(classifyError(new StreamableHTTPError(401, "no")).kind, "auth");
  assert.equal(classifyError(new StreamableHTTPError(400, "bad")).kind, "rejected");
  assert.equal(classifyError(new StreamableHTTPError(502, "gateway")).kind, "ambiguous");
  assert.equal(classifyError(new McpError(ErrorCode.RequestTimeout, "t")).kind, "ambiguous");
  assert.equal(classifyError(new McpError(ErrorCode.InvalidParams, "p")).kind, "rejected");
  assert.equal(classifyError(new TypeError("fetch failed")).kind, "ambiguous");
});
