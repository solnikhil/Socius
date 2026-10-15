import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelRequest, ModelRunner } from "../src/model.js";
import type { Snapshot } from "@socius/contracts/app";
import { paired, connectModel } from "./helpers.js";

test("chats tell the model which model it is and where the user is writing from", async () => {
  const dir = await mkdtemp(join(tmpdir(), "socius-harness-"));
  let seen: ModelRequest | undefined;
  const runner: ModelRunner = async (request, onText) => {
    seen = request;
    onText("ok");
    return "ok";
  };
  const r = await paired(dir, runner);
  try {
    await connectModel(r, "fixture-model");
    const state = (await (await r.request("state")).json()) as Snapshot;
    const main = state.bots.find((b) => b.template.id === "socius/main")!;
    await (
      await r.request("chat", { botId: main.id, content: "what's the time?" })
    ).text();
    assert.equal(seen?.modelLabel, "fixture-model");
    assert.equal(seen?.client, "desktop");
    // The stored Socius picks up the general-assistant instructions.
    assert.match(seen!.bot.instructions, /Answer anything yourself/);
  } finally {
    await r.close();
    await rm(dir, { recursive: true, force: true });
  }
});
