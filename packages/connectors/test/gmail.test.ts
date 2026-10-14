import { test } from "node:test";
import assert from "node:assert/strict";
import { gmail } from "../src/gmail.js";
import { curatedCatalog } from "@socius/marketplace/curated";
import { verifyManifest, type McpToolClient } from "../src/index.js";
import type { ConnectorManifest } from "@socius/contracts";
test("Gmail permits approved drafts without exposing a send or raw MIME escape hatch", async () => {
  assert.deepEqual(
    verifyManifest(
      curatedCatalog.find((p) => p.id === gmail.id) as ConnectorManifest,
    ),
    [],
  );
  const action = gmail.actions.find((a) => a.access === "write")!;
  const input = {
    to: ["person@example.com"],
    subject: "Update",
    body: "Details",
  };
  for (const bad of [
    { ...input, to: ["Person <person@example.com>"] },
    { ...input, subject: "Hello\r\nBcc: other@example.com" },
    { ...input, raw: "encoded MIME" },
    { ...input, send: true },
  ])
    assert.equal(action.input.safeParse(bad).success, false);
  const calls: unknown[] = [];
  const client: McpToolClient = {
    listTools: async () => [],
    close: async () => {},
    callTool: async (name, args) => {
      calls.push({ name, args });
      return { text: "draft-id", isError: false };
    },
  };
  await action.execute(client, action.input.parse(input));
  assert.deepEqual(calls, [{ name: "create_draft", args: input }]);
  assert.ok(gmail.actions.every((a) => !a.id.includes("send")));
});
