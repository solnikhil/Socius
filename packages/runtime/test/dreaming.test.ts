import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BotInstance } from "@socius/contracts";
import type { DreamRun, Message, Task } from "@socius/contracts/app";
import { paired, connectModel } from "./helpers.js";
import { type DreamInput, type DreamRunner } from "../src/dreaming.js";

const chat = async (_request: unknown, text: (v: string) => void) => { text("OK"); return "OK"; };
type Runtime = Awaited<ReturnType<typeof paired>>;
async function fixture(t: TestContext, runner?: DreamRunner, options: { now?: () => number; timeoutMs?: number } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "socius-dream-"));
  let runtime = await paired(dir, chat, { ...(runner ? { dreamRunner: runner } : {}), dreamingOptions: options });
  t.after(async () => { await runtime.close(); await rm(dir, { recursive: true, force: true }); });
  const connection = await connectModel(runtime, "chat-model");
  await runtime.request("models", { connectionId: connection.id, modelId: "dream-model" });
  const ref = { connectionId: connection.id, modelId: "dream-model" };
  const bot = runtime.store.all<BotInstance>("bot")[0]!;
  await runtime.request("grants", { botId: bot.id, memory: true });
  async function enable(enabled = true) {
    return runtime.request("dreaming/settings", { enabled, model: ref, idleMinutes: 5, intervalMinutes: 60, expectedRevision: runtime.dreaming.settings().revision });
  }
  return { get r() { return runtime; }, dir, bot, ref, enable, async restart(next = runner) {
    await runtime.close();
    runtime = await paired(dir, chat, { ...(next ? { dreamRunner: next } : {}), dreamingOptions: options });
    return runtime;
  } };
}
function source(r: Runtime, botId: string, content: string, state: Task["state"] = "completed", groupId?: string) {
  const task: Task = { id: randomUUID(), botId, state, error: null, createdAt: new Date().toISOString(), ...(groupId ? { groupId } : {}) };
  const message: Message = { id: randomUUID(), taskId: task.id, botId, role: "user", content, createdAt: task.createdAt, ...(groupId ? { groupId } : {}) };
  r.store.put("task", task.id, task); r.store.put("message", message.id, message);
  return message;
}
async function finished(r: Runtime, id: string) {
  for (let i = 0; i < 100; i++) {
    const run = r.store.get<DreamRun>("dream-run", id)!;
    if (run.state !== "running") return run;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.fail("Dream did not settle");
}
const extract: DreamRunner = async ({ sources }) => ({ changes: [{ memoryId: null, content: "The user prefers concise pricing briefs.", sourceMessageIds: [sources[0]!.id] }] });

test("dreaming is off by default; setup, exact model selection, settings revisions and auth fail closed", async (t) => {
  let calls = 0;
  const f = await fixture(t, async (input) => { calls++; return extract(input); });
  source(f.r, f.bot.id, "I prefer concise pricing briefs.");
  assert.equal(f.r.dreaming.settings().enabled, false);
  f.r.dreaming.tick(); assert.equal(calls, 0);
  assert.equal((await f.r.request("dreaming/run", { botId: f.bot.id })).status, 409);
  assert.equal((await fetch(`${f.r.origin}/api/dreaming`)).status, 401);
  assert.equal((await f.r.request("dreaming/settings", { enabled: true, model: null, idleMinutes: 5, intervalMinutes: 60, expectedRevision: 0 })).status, 400);
  assert.equal((await f.enable()).status, 200);
  assert.equal(f.r.store.providers.selection().default?.modelId, "chat-model");
  assert.equal(f.r.dreaming.settings().model?.modelId, "dream-model");
  assert.equal((await f.r.request("dreaming/settings", { ...f.r.dreaming.settings(), expectedRevision: 0 })).status, 400); // unknown revision field
  assert.equal((await f.r.request("dreaming/settings", { enabled: false, model: f.ref, idleMinutes: 5, intervalMinutes: 60, expectedRevision: 0 })).status, 409);
  await f.r.request("models", f.ref, "DELETE");
  assert.equal(f.r.dreaming.status().modelAvailable, false);
  assert.equal((await f.r.request("dreaming/run", { botId: f.bot.id })).status, 404);
  assert.equal((await f.enable(false)).status, 200); // disabling remains possible with an unavailable saved model
  assert.equal(calls, 0);
});

test("eligible direct user sources are bounded and private; completion persists cited Markdown and checkpoints", async (t) => {
  let input: DreamInput | undefined;
  const f = await fixture(t, async (value) => { input = value; return extract(value); });
  const m = source(f.r, f.bot.id, "I prefer concise pricing briefs.");
  source(f.r, f.bot.id, "Failed fact", "failed");
  source(f.r, f.bot.id, "Unfinished fact", "running");
  source(f.r, f.bot.id, "Group fact", "completed", randomUUID());
  source(f.r, f.bot.id, "Attached document: prices\n<document>private</document>");
  source(f.r, f.bot.id, "x".repeat(4001));
  const assistant = { ...m, id: randomUUID(), role: "assistant" }; f.r.store.put("message", assistant.id, assistant);
  const otherId = randomUUID(); source(f.r, otherId, "Another bot's secret");
  await f.enable();
  const run = await finished(f.r, f.r.dreaming.runNow(f.bot.id).id);
  assert.equal(run.state, "completed"); assert.equal(run.saved, 1); assert.equal(run.skipped, 2);
  assert.deepEqual(input!.sources.map((s) => s.id), [m.id]);
  assert.equal("tools" in input!, false);
  const memory = f.r.store.memory(f.bot.id)[0]!;
  assert.deepEqual(memory.dream?.sourceMessageIds, [m.id]);
  assert.match(await readFile(join(f.r.store.memoryDir, `${memory.id}.md`), "utf8"), /Dreaming/);
  assert.ok(f.r.store.get("dream-processed", m.id));
  await f.restart();
  assert.deepEqual(f.r.store.memory(f.bot.id)[0], memory);
  assert.equal((await f.r.request("dreaming/run", { botId: f.bot.id })).status, 409);
  const evidence = await (await f.r.request(`dreaming/sources?botId=${f.bot.id}&memoryId=${memory.id}`)).json();
  assert.equal(evidence[0].content, m.content);
  assert.equal((await f.r.request(`dreaming/sources?botId=${otherId}&runId=${run.id}`)).status, 404);
});

test("consolidation updates dream notes, deduplicates content and protects manual corrections", async (t) => {
  let mode = "new";
  const f = await fixture(t, async (input) => ({ changes: [{ memoryId: mode === "update" ? input.memories[0]!.id : null, content: mode === "new" ? "User prefers short briefs." : "User prefers detailed pricing briefs.", sourceMessageIds: [input.sources[0]!.id] }] }));
  source(f.r, f.bot.id, "I prefer short briefs."); await f.enable();
  await finished(f.r, f.r.dreaming.runNow(f.bot.id).id);
  const original = f.r.store.memory(f.bot.id)[0]!;
  mode = "update"; source(f.r, f.bot.id, "Actually, I prefer detailed pricing briefs.");
  assert.equal((await finished(f.r, f.r.dreaming.runNow(f.bot.id).id)).saved, 1);
  assert.equal(f.r.store.memory(f.bot.id).length, 1);
  const corrected = await f.r.request("memory", { botId: f.bot.id, id: original.id, content: "My corrected note." });
  assert.equal(corrected.status, 200);
  assert.ok(f.r.store.memory(f.bot.id)[0]!.dream);
  source(f.r, f.bot.id, "Another statement");
  const refused = await finished(f.r, f.r.dreaming.runNow(f.bot.id).id);
  assert.equal(refused.errorCode, "invalid_output");
  assert.equal(f.r.store.memory(f.bot.id)[0]!.content, "My corrected note.");
  mode = "new";
  const duplicate = f.r.store.saveMemory(f.bot.id, "User prefers short briefs.", "User editor");
  const dedup = await finished(f.r, f.r.dreaming.runNow(f.bot.id).id);
  assert.equal(dedup.saved, 0); assert.equal(dedup.skipped, 1);
  assert.ok(f.r.store.memory(f.bot.id).some((m) => m.id === duplicate.id));
});

for (const invalid of ["forged source", "cross-bot target", "unknown fields"] as const) {
  test(`invalid output rejects ${invalid} without saving`, async (t) => {
    const f = await fixture(t, async ({ sources }) => ({ changes: [{ memoryId: invalid === "cross-bot target" ? randomUUID() : null, content: "Unsupported fact", sourceMessageIds: [invalid === "forged source" ? randomUUID() : sources[0]!.id], ...(invalid === "unknown fields" ? { grant: "all" } : {}) }] }));
    source(f.r, f.bot.id, "Real user fact"); await f.enable();
    const run = await finished(f.r, f.r.dreaming.runNow(f.bot.id).id);
    assert.equal(run.state, "failed"); assert.equal(run.errorCode, "invalid_output");
    assert.equal(f.r.store.memory(f.bot.id).length, 0);
    assert.equal(f.r.store.all("dream-processed").length, 0);
  });
}

for (const mutation of ["disable", "revoke-regrant", "edit", "delete", "source-edit", "foreground", "cancel"] as const) {
  test(`in-flight ${mutation} prevents stale memory writes and releases provider ownership`, async (t) => {
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>((r) => { started = r; });
    const gate = new Promise<void>((r) => { release = r; });
    const f = await fixture(t, async (input) => { started(); await gate; return extract(input); });
    const note = f.r.store.saveMemory(f.bot.id, "Existing note", "User editor");
    const m = source(f.r, f.bot.id, "I prefer concise pricing briefs."); await f.enable();
    const run = f.r.dreaming.runNow(f.bot.id); await entered;
    assert.equal((await f.r.request("providers", { id: f.ref.connectionId }, "DELETE")).status, 409);
    assert.equal((await f.r.request("dreaming/run", { botId: f.bot.id })).status, 409);
    if (mutation === "disable") await f.enable(false);
    if (mutation === "revoke-regrant") { await f.r.request("grants", { botId: f.bot.id, memory: false }); await f.r.request("grants", { botId: f.bot.id, memory: true }); }
    if (mutation === "edit") await f.r.request("memory", { botId: f.bot.id, id: note.id, content: "Manually changed" });
    if (mutation === "delete") await f.r.request("memory", { botId: f.bot.id, id: note.id }, "DELETE");
    if (mutation === "source-edit") f.r.store.put("message", m.id, { ...m, content: "Different statement" });
    if (mutation === "foreground") { const res = await f.r.request("chat", { botId: f.bot.id, content: "Continue chat" }); await res.text(); }
    if (mutation === "cancel") await f.r.request("dreaming/cancel", { id: run.id });
    release();
    const result = await finished(f.r, run.id);
    assert.ok(["stale", "cancelled"].includes(result.state), JSON.stringify(result));
    assert.ok(!f.r.store.memory(f.bot.id).some((m) => m.source === "Dreaming"));
    assert.equal(f.r.store.get("dream-processed", m.id), undefined);
    await new Promise<void>((r) => setImmediate(r));
    assert.equal(f.r.dreaming.usesConnection(f.ref.connectionId), false);
  });
}

test("timeout and shutdown release a stalled runner without waiting for its late answer", async (t) => {
  const f = await fixture(t, async () => new Promise(() => {}), { timeoutMs: 10 });
  source(f.r, f.bot.id, "Pending fact"); await f.enable();
  const run = f.r.dreaming.runNow(f.bot.id);
  await new Promise((r) => setTimeout(r, 25));
  const result = await finished(f.r, run.id);
  assert.equal(result.state, "failed"); assert.equal(result.errorCode, "timeout");
  const next = f.r.dreaming.runNow(f.bot.id);
  await f.restart(async () => ({ changes: [] }));
  assert.equal(f.r.store.get<DreamRun>("dream-run", next.id)!.state, "cancelled");
});

test("idle scheduler observes cooldown, foreground priority, bounded catch-up and single flight", async (t) => {
  let now = Date.now(), calls = 0;
  const f = await fixture(t, async () => { calls++; return { changes: [] }; }, { now: () => now });
  for (let i = 0; i < 50; i++) source(f.r, f.bot.id, `Fact ${i}`);
  await f.enable();
  f.r.dreaming.tick(); assert.equal(calls, 0);
  now += 5 * 60000; f.r.dreaming.tick(); f.r.dreaming.tick();
  let first = f.r.dreaming.status().runs[0]!;
  assert.equal((await finished(f.r, first.id)).sourceMessageIds.length, 24);
  f.r.dreaming.tick(); assert.equal(calls, 1);
  f.r.dreaming.foregroundStarted(); now += 3600000;
  f.r.dreaming.foregroundFinished(); f.r.dreaming.tick(); assert.equal(calls, 1);
  now += 5 * 60000; f.r.dreaming.tick();
  first = f.r.dreaming.status().runs[0]!; await finished(f.r, first.id);
  assert.equal(calls, 2);
});

test("deleted dream evidence stays suppressed across restart and manual retry", async (t) => {
  const f = await fixture(t, extract);
  const m = source(f.r, f.bot.id, "I prefer concise pricing briefs."); await f.enable();
  await finished(f.r, f.r.dreaming.runNow(f.bot.id).id);
  const note = f.r.store.memory(f.bot.id)[0]!;
  await f.r.request("memory", { botId: f.bot.id, id: note.id }, "DELETE");
  f.r.store.delete("dream-processed", m.id); // prove suppression, not just the successful checkpoint
  await f.restart();
  assert.ok(f.r.store.get("dream-suppressed", m.id));
  assert.equal((await f.r.request("dreaming/run", { botId: f.bot.id })).status, 409);
  assert.equal(f.r.store.memory(f.bot.id).length, 0);
});

test("interrupted multi-file commit resumes stable writes once; edited partial writes invalidate recovery", async (t) => {
  for (const conflict of [false, true]) {
    await t.test(String(conflict), async (t) => {
      const f = await fixture(t, async ({ sources }) => ({ changes: ["First fact", "Second fact"].map((content) => ({ content, memoryId: null, sourceMessageIds: [sources[0]!.id] })) }));
      source(f.r, f.bot.id, "Two durable facts"); await f.enable();
      const save = f.r.store.saveMemory.bind(f.r.store); let calls = 0;
      f.r.store.saveMemory = (...args) => { if (++calls === 2) throw new Error("simulated write interruption"); return save(...args); };
      const run = await finished(f.r, f.r.dreaming.runNow(f.bot.id).id);
      assert.equal(run.state, "committing");
      const partial = f.r.store.memory(f.bot.id)[0]!;
      if (conflict) await writeFile(join(f.r.store.memoryDir, `${partial.id}.md`), (await readFile(join(f.r.store.memoryDir, `${partial.id}.md`), "utf8")).replace("First fact", "External correction"));
      await f.restart();
      const result = f.r.store.get<DreamRun>("dream-run", run.id)!;
      assert.equal(result.state, conflict ? "stale" : "completed");
      assert.equal(f.r.store.memory(f.bot.id).length, conflict ? 1 : 2);
      if (!conflict) { await f.restart(); assert.equal(f.r.store.memory(f.bot.id).length, 2); }
    });
  }
});

test("failed SQLite finalization preserves the journal and recovers already-written notes", async (t) => {
  const f = await fixture(t, extract);
  source(f.r, f.bot.id, "I prefer concise pricing briefs."); await f.enable();
  const transaction = f.r.store.transaction.bind(f.r.store); let injected = false;
  f.r.store.transaction = (fn) => transaction(() => {
    const result = fn();
    if (!injected && f.r.store.all<DreamRun>("dream-run").some((r) => r.state === "completed")) { injected = true; throw new Error("checkpoint failure"); }
    return result;
  });
  const run = await finished(f.r, f.r.dreaming.runNow(f.bot.id).id);
  assert.equal(run.state, "committing"); assert.equal(f.r.store.memory(f.bot.id).length, 1);
  await f.restart();
  assert.equal(f.r.store.get<DreamRun>("dream-run", run.id)!.state, "completed");
  assert.equal(f.r.store.memory(f.bot.id).length, 1);
});

test("retention keeps recent runs, checkpoints preserve old input, and legacy memory survives", async (t) => {
  const f = await fixture(t, async () => ({ changes: [] }));
  const old = f.r.store.saveMemory(f.bot.id, "Legacy note", "User editor");
  for (let i = 0; i < 40; i++) {
    const id = randomUUID();
    f.r.store.put("dream-run", id, { id, botId: f.bot.id, model: f.ref, state: "failed", createdAt: new Date().toISOString(), finishedAt: new Date().toISOString(), sourceMessageIds: [], saved: 0, skipped: 0, error: "fixture" });
  }
  const m = source(f.r, f.bot.id, "Old processed statement");
  f.r.store.put("dream-processed", m.id, { botId: f.bot.id });
  await f.restart();
  assert.equal(f.r.store.all("dream-run").length, 30);
  assert.ok(f.r.store.get("dream-processed", m.id));
  assert.deepEqual(f.r.store.memory(f.bot.id), [old]);
});

test("memory deletion journal recovers after file removal and before database acknowledgement", async (t) => {
  const f = await fixture(t, extract);
  const m = source(f.r, f.bot.id, "I prefer concise pricing briefs."); await f.enable();
  await finished(f.r, f.r.dreaming.runNow(f.bot.id).id);
  const note = f.r.store.memory(f.bot.id)[0]!;
  const remove = f.r.store.delete.bind(f.r.store); let failed = false;
  f.r.store.delete = (kind, id) => { if (kind === "memory-delete" && !failed) { failed = true; throw new Error("deletion acknowledgement interrupted"); } remove(kind, id); };
  assert.equal((await f.r.request("memory", { botId: f.bot.id, id: note.id }, "DELETE")).status, 500);
  assert.ok(f.r.store.get("dream-suppressed", m.id));
  assert.ok(f.r.store.get("memory-delete", note.id));
  await f.restart();
  assert.equal(f.r.store.memory(f.bot.id).length, 0);
  assert.equal(f.r.store.all("memory-delete").length, 0);
  assert.ok(f.r.store.get("dream-suppressed", m.id));
});

test("bot deletion cancels its dream and removes private ledgers without recreating them", async (t) => {
  let entered!: () => void;
  const started = new Promise<void>((r) => { entered = r; });
  const f = await fixture(t, async () => { entered(); return new Promise(() => {}); });
  const specialist = await (await f.r.request("bots", { name: "Private", role: "Testing", instructions: "Test private state" })).json() as BotInstance;
  await f.r.request("grants", { botId: specialist.id, memory: true });
  source(f.r, specialist.id, "Specialist private fact"); await f.enable();
  f.r.store.put("board", "historical", { id: "historical", memberIds: [specialist.id] });
  f.r.dreaming.runNow(specialist.id); await started;
  assert.equal((await f.r.request("bots", { id: specialist.id }, "DELETE")).status, 200);
  await new Promise<void>((r) => setImmediate(r));
  assert.equal(f.r.store.get("bot", specialist.id), undefined);
  assert.equal(f.r.store.all<DreamRun>("dream-run").filter((r) => r.botId === specialist.id).length, 0);
  assert.equal(f.r.store.messages(specialist.id).length, 0);
  assert.ok(f.r.store.get("board", "historical"));
  await f.restart(); assert.ok(f.r.store.get("board", "historical"));
});

test("bot deletion resumes after its SQLite cleanup rolls back; board history remains", async (t) => {
  const f = await fixture(t, extract);
  const specialist = await (await f.r.request("bots", { name: "Private", role: "Testing", instructions: "Test private state" })).json() as BotInstance;
  const note = f.r.store.saveMemory(specialist.id, "Private note", "User editor");
  f.r.store.put("board", "historical", { id: "historical" });
  const remove = f.r.store.delete.bind(f.r.store); let failed = false;
  f.r.store.delete = (kind, id) => { if (kind === "bot" && !failed) { failed = true; throw new Error("bot deletion interrupted"); } remove(kind, id); };
  assert.equal((await f.r.request("bots", { id: specialist.id }, "DELETE")).status, 500);
  assert.ok(f.r.store.get("bot-delete", specialist.id));
  await assert.rejects(readFile(join(f.r.store.memoryDir, `${note.id}.md`)));
  await f.restart();
  assert.equal(f.r.store.get("bot", specialist.id), undefined);
  assert.equal(f.r.store.all("bot-delete").length, 0);
  assert.ok(f.r.store.get("board", "historical"));
});

test("batch/context/capacity bounds are enforced and skipped additions are visible", async (t) => {
  let captured: DreamInput | undefined;
  const f = await fixture(t, async (input) => { captured = input; return extract(input); });
  for (let i = 0; i < 200; i++) f.r.store.saveMemory(f.bot.id, `Existing fact ${i}: ${"n".repeat(600)}`, "Dreaming");
  for (let i = 0; i < 12; i++) source(f.r, f.bot.id, `${i}: ${"x".repeat(3990)}`);
  await f.enable();
  const run = await finished(f.r, f.r.dreaming.runNow(f.bot.id).id);
  assert.equal(run.saved, 0); assert.equal(run.skipped, 1);
  assert.ok(captured!.sources.reduce((n, s) => n + s.content.length, 0) <= 32000);
  assert.ok(captured!.memories.length <= 80);
  assert.ok(JSON.stringify(captured!.memories).length <= 40100);
  assert.equal(f.r.store.memory(f.bot.id).length, 200);
});

test("provider failures are classified without persisting raw private errors", async (t) => {
  const f = await fixture(t, async () => { throw new TypeError("fetch failed: private-source-secret"); });
  source(f.r, f.bot.id, "A private preference"); await f.enable();
  const run = await finished(f.r, f.r.dreaming.runNow(f.bot.id).id);
  assert.equal(run.errorCode, "unreachable");
  assert.ok(!JSON.stringify(f.r.dreaming.status()).includes("private-source-secret"));
  assert.ok(!JSON.stringify(f.r.store.all("activity")).includes("private-source-secret"));
});
