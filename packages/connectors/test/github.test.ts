import { test } from "node:test";
import assert from "node:assert/strict";
import { github } from "../src/github.js";
import { curatedCatalog } from "@socius/marketplace/curated";
import { verifyManifest, type McpToolClient } from "../src/index.js";
import type { ConnectorManifest } from "@socius/contracts";
test("GitHub fixes issue methods and refuses update/extra parameters", async () => {
  assert.deepEqual(
    verifyManifest(
      curatedCatalog.find((p) => p.id === github.id) as ConnectorManifest,
    ),
    [],
  );
  const action = github.actions.find((a) => a.access === "write")!;
  const input = {
    owner: "acme",
    repo: "project",
    title: "Fix",
    body: "Details",
  };
  for (const extra of [
    { method: "update" },
    { issue_number: 1 },
    { assignees: ["somebody"] },
  ])
    assert.equal(action.input.safeParse({ ...input, ...extra }).success, false);
  const calls: unknown[] = [];
  const client: McpToolClient = {
    listTools: async () => [],
    close: async () => {},
    callTool: async (name, args) => {
      calls.push({ name, args });
      return { text: "created", isError: false };
    },
  };
  await action.execute(client, action.input.parse(input));
  assert.deepEqual(calls, [
    { name: "issue_write", args: { ...input, method: "create" } },
  ]);
  await assert.rejects(
    action.execute(
      {
        ...client,
        callTool: async () => ({
          text: "interactive form; not created",
          isError: true,
        }),
      },
      input,
    ),
    /rejected/,
  );
});
