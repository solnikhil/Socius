import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { googleDrive } from "../src/google-drive.js";
import { curatedCatalog } from "@socius/marketplace/curated";
import {
  checkToolSchemas,
  reviewedConnectors,
  verifyManifest,
  type McpToolClient,
} from "../src/index.js";
import type { ConnectorManifest } from "@socius/contracts";
test("Drive binds an explicit folder and cannot overwrite, share or upload arbitrary MIME", async () => {
  const action = googleDrive.actions.find((a) => a.access === "write")!;
  const input = {
    parentId: "folder-id",
    title: "Plan",
    textContent: "Private text",
  };
  for (const bad of [
    { title: "Plan", textContent: "text" },
    { ...input, fileId: "existing-file" },
    { ...input, permissions: [{ type: "anyone" }] },
    { ...input, contentMimeType: "text/html" },
    { ...input, base64Content: "encoded" },
    { ...input, title: "../other" },
  ])
    assert.equal(action.input.safeParse(bad).success, false);
  let called: unknown;
  const client: McpToolClient = {
    listTools: async () => [],
    close: async () => {},
    callTool: async (name, args) => {
      called = { name, args };
      return { text: "file-id", isError: false };
    },
  };
  await action.execute(client, action.input.parse(input));
  assert.deepEqual(called, {
    name: "create_file",
    args: {
      ...input,
      contentMimeType: "text/plain",
      disableConversionToGoogleType: false,
    },
  });
});
test("every reviewed connector matches its manifest, exports model-safe inputs and fails closed on missing upstream tools", () => {
  for (const connector of reviewedConnectors) {
    assert.deepEqual(
      verifyManifest(
        curatedCatalog.find((p) => p.id === connector.id) as ConnectorManifest,
      ),
      [],
      connector.id,
    );
    assert.match(checkToolSchemas(connector, [])!, /no longer offers/);
    for (const action of connector.actions) {
      assert.doesNotThrow(
        () => z.toJSONSchema(action.params, { io: "input" }),
        action.id,
      );
      assert.equal(
        action.params.safeParse({ unreviewed: true }).success,
        false,
      );
    }
  }
});
