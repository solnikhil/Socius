import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  Approval,
  GroupChat,
  Message,
  Snapshot,
} from "@socius/contracts/app";
import type { BotInstance } from "@socius/contracts";
import type { ModelRunner } from "../src/model.js";
import { paired, connectModel } from "./helpers.js";

/** What each fake specialist saw, to prove it gets only Socius's request. */
const seen: { bot: string; messages: number; briefing: string }[] = [];
const runner: ModelRunner = async (request, onText) => {
  const text = String(request.messages.at(-1)?.content);
  const say = (out: string) => {
    onText(out);
    return out;
  };
  if (request.bot.template.id !== "socius/main") {
    seen.push({
      bot: request.bot.name,
      messages: request.messages.length,
      briefing: request.briefing ?? "",
    });
    return say(`${request.bot.name}: 1. Research 2. Draft 3. Ship`);
  }
  if (text.includes("ask planner")) {
    onText("Let me check with Planner.");
    const reply = await request.askBot!(
      "planner",
      "Outline three launch steps",
    );
    const again = await request.askBot!(
      "Planner",
      "Outline three launch steps",
    );
    const missing = await request.askBot!("Nobody", "Hello");
    return say(
      `Let me check with Planner.\n\nPlanner says: ${reply}\n${again.split("\n")[0]}\n${missing}`,
    );
  }
  if (text.includes("make group"))
    return say(
      JSON.stringify(
        await request.orchestrate!.createGroup({
          name: "Launch crew",
          members: ["Planner"],
        }),
      ),
    );
  if (text.includes("change planner"))
    return say(
      JSON.stringify(
        await request.orchestrate!.updateBot({
          bot: "Planner",
          role: "Launch planner",
        }),
      ),
    );
  if (text.includes("edit socius"))
    return say(
      JSON.stringify(
        await request.orchestrate!.updateBot({ bot: "Socius", role: "Other" }),
      ),
    );
  if (text.includes("add writer"))
    return say(
      JSON.stringify(
        await request.orchestrate!.changeMembers({
          group: "Launch crew",
          add: ["Writer"],
        }),
      ),
    );
  return say("Okay.");
};

async function setup(name: string) {
  const dir = await mkdtemp(join(tmpdir(), `socius-orch-${name}-`));
  const r = await paired(dir, runner);
  await connectModel(r);
  const state = async () =>
    (await (await r.request("state")).json()) as Snapshot;
  const main = (await state()).bots[0]!;
  const make = async (botName: string) =>
    (await (
      await r.request("bots", {
        name: botName,
        role: `${botName} role`,
        instructions: `Work as ${botName}.`,
      })
    ).json()) as BotInstance;
  const chat = (content: string) =>
    r.request("chat", { botId: main.id, content }).then((res) => res.text());
  const pending = async (kind: Approval["kind"]) => {
    for (let i = 0; i < 200; i++) {
      const a = (await state()).approvals.find(
        (x) => x.kind === kind && x.state === "pending",
      );
      if (a) return a;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`No pending ${kind} proposal`);
  };
  const decide = (a: Approval, approve: boolean, feedback?: string) =>
    r.request("approvals", {
      id: a.id,
      digest: a.digest,
      approve,
      ...(feedback ? { feedback } : {}),
    });
  const close = async () => {
    await r.close();
    await rm(dir, { recursive: true, force: true });
  };
  return { r, state, main, make, chat, pending, decide, close };
}

test("Socius asks a specialist directly and the thread reads Socius, specialist, Socius", async () => {
  const t = await setup("ask");
  try {
    const planner = await t.make("Planner");
    seen.length = 0;
    const events = await t.chat("ask planner for launch steps");
    assert.match(events, /"type":"done"/);
    // The specialist sees only Socius's request, with its own framing.
    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.bot, "Planner");
    assert.equal(seen[0]!.messages, 1);
    assert.match(seen[0]!.briefing, /asking you directly on the user's behalf/);
    const messages = (await (
      await t.r.request(`messages?botId=${t.main.id}`)
    ).json()) as Message[];
    assert.deepEqual(
      messages.map((m) => [m.role, m.delegated?.botId ?? null]),
      [
        ["user", null],
        ["assistant", null],
        ["assistant", planner.id],
        ["assistant", null],
      ],
    );
    assert.equal(messages[1]!.content, "Let me check with Planner.");
    assert.equal(messages[2]!.content, "Planner: 1. Research 2. Draft 3. Ship");
    assert.equal(messages[2]!.delegated!.request, "Outline three launch steps");
    assert.match(messages[3]!.content, /^Planner says: Planner: 1\. Research/);
    // Repeats are answered from the first reply; unknown names list the roster.
    assert.match(messages[3]!.content, /already answered this request/);
    assert.match(
      messages[3]!.content,
      /No bot is called "Nobody"\. Bots: Planner/,
    );
    // The exchange lives in Socius's chat, never in the specialist's own.
    const own = (await (
      await t.r.request(`messages?botId=${planner.id}`)
    ).json()) as Message[];
    assert.equal(own.length, 0);
  } finally {
    await t.close();
  }
});

test("workspace changes wait for review: approve applies, a reply declines and returns", async () => {
  const t = await setup("changes");
  try {
    const planner = await t.make("Planner");
    const writer = await t.make("Writer");

    // Create a group chat: nothing exists until the user approves.
    let chatting = t.chat("make group for the launch");
    let proposal = await t.pending("group");
    assert.equal((await t.state()).groups.length, 0);
    assert.equal(
      (await t.state()).tasks.find((x) => x.state === "running")?.botId,
      t.main.id,
    );
    assert.equal((await t.decide(proposal, true)).status, 200);
    let events = await chatting;
    assert.match(events, /"type":"approval"/);
    assert.match(events, /\\"status\\":\\"done\\"/);
    const groups = (await t.state()).groups as GroupChat[];
    assert.deepEqual(
      groups.map((g) => [g.name, g.memberIds]),
      [["Launch crew", [planner.id]]],
    );

    // Change members: the proposal lists the final member set.
    chatting = t.chat("add writer to the crew");
    proposal = await t.pending("group-members");
    assert.match(proposal.content, /add Writer/);
    await t.decide(proposal, true);
    await chatting;
    assert.deepEqual((await t.state()).groups[0]!.memberIds, [
      planner.id,
      writer.id,
    ]);

    // Edit a bot: a typed answer declines and reaches Socius.
    chatting = t.chat("change planner's role");
    proposal = await t.pending("bot-update");
    assert.equal(proposal.content, "Update Planner: change its role");
    assert.equal(
      (await t.decide(proposal, true, "both")).status,
      400,
      "feedback cannot accompany approval",
    );
    await t.decide(proposal, false, "Call it Launch lead instead");
    events = await chatting;
    assert.match(events, /declined-with-feedback/);
    assert.match(events, /Call it Launch lead instead/);
    let bots = (await t.state()).bots;
    assert.equal(bots.find((b) => b.id === planner.id)!.role, "Planner role");

    // Approving the edit applies exactly the proposed field.
    chatting = t.chat("change planner's role");
    proposal = await t.pending("bot-update");
    await t.decide(proposal, true);
    await chatting;
    bots = (await t.state()).bots;
    const updated = bots.find((b) => b.id === planner.id)!;
    assert.equal(updated.role, "Launch planner");
    assert.equal(updated.instructions, "Work as Planner.");

    // Socius cannot propose edits to itself.
    events = await t.chat("edit socius");
    assert.match(events, /No bot is called .{0,8}Socius.{0,8}\. Bots: Planner, Writer/);
  } finally {
    await t.close();
  }
});

test("stopping Socius while it waits leaves the proposal pending and changes nothing", async () => {
  const t = await setup("stop");
  try {
    await t.make("Planner");
    const chatting = t.chat("make group for the launch");
    const proposal = await t.pending("group");
    const task = (await t.state()).tasks.find((x) => x.state === "running")!;
    await t.r.request("tasks/cancel", { id: task.id });
    await chatting;
    const state = await t.state();
    assert.equal(state.groups.length, 0);
    assert.equal(
      state.approvals.find((a) => a.id === proposal.id)!.state,
      "pending",
    );
  } finally {
    await t.close();
  }
});
