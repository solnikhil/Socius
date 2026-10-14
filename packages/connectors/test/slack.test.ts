import { test } from "node:test";
import assert from "node:assert/strict";
import { slack } from "../src/slack.js";
import { curatedCatalog } from "@socius/marketplace/curated";
import { verifyManifest, type McpToolClient } from "../src/index.js";
import type { ConnectorManifest } from "@socius/contracts";
test("Slack cannot redirect a post through DM, scheduling or arbitrary upstream fields", async () => {
  assert.deepEqual(
    verifyManifest(
      curatedCatalog.find((p) => p.id === slack.id) as ConnectorManifest,
    ),
    [],
  );
  const action = slack.actions.find((a) => a.access === "write")!;
  const input = {
    channel_id: "C12345678",
    message: "First line\n\nSecond line",
  };
  for (const bad of [
    { ...input, channel_id: "D12345678" },
    { ...input, channel_id: "#general" },
    { ...input, post_at: 2000000000 },
    { ...input, draft_id: "draft" },
    { ...input, reply_broadcast: true },
  ])
    assert.equal(action.input.safeParse(bad).success, false);
  let called: unknown;
  const client: McpToolClient = {
    listTools: async () => [],
    close: async () => {},
    callTool: async (name, args) => {
      called = { name, args };
      return { text: "posted", isError: false };
    },
  };
  await action.execute(client, action.input.parse(input));
  assert.deepEqual(called, { name: "slack_send_message", args: input });
  assert.deepEqual(slack.oauth!.scopes, ["search:read.public", "chat:write"]);
});
