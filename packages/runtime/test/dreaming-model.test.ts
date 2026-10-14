import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { instantiateBot, mainBot } from "@socius/marketplace";
import { languageModel } from "../src/providers/factory.js";
import { DREAM_OUTPUT_SCHEMA, runDream } from "../src/dreaming.js";
import { runModel } from "../src/model.js";

test("production dream runner states the schema when the adapter only supports JSON mode", async () => {
  const id = randomUUID(); let calls = 0;
  const expected = { changes: [{ memoryId: null, content: "User likes concise briefs.", sourceMessageIds: [id] }] };
  const model = languageModel("openai-compatible", { baseURL: "https://dreaming.fixture/v1" }, "dream-model", async (_url, init) => {
    calls++;
    const body = JSON.parse(init!.body as string);
    assert.equal(body.model, "dream-model");
    assert.equal(body.tools, undefined);
    // OpenAI-compatible adapters send JSON mode without a schema; the prompt carries it.
    assert.equal(body.response_format.type, "json_object");
    assert.ok(JSON.stringify(body.messages).includes(JSON.stringify(DREAM_OUTPUT_SCHEMA).slice(1, -1)));
    assert.equal(body.max_tokens ?? body.max_completion_tokens, 3000);
    assert.ok(JSON.stringify(body.messages).includes(id));
    return new Response(JSON.stringify({ id: "fixture", object: "chat.completion", created: 1, model: "dream-model", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(expected) }, finish_reason: "stop" }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } }), { headers: { "content-type": "application/json" } });
  });
  assert.deepEqual(await runDream({ model, sources: [{ id, content: "I like concise briefs.", createdAt: new Date().toISOString() }], memories: [], signal: new AbortController().signal }), expected);
  assert.equal(calls, 1);
  // Strict validation still rejects output that ignores the stated shape.
  const loose = languageModel("openai-compatible", { baseURL: "https://dreaming.fixture/v1" }, "dream-model", async () =>
    new Response(JSON.stringify({ id: "fixture", object: "chat.completion", created: 1, model: "dream-model", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({ changes: [{ content: "No sources", extra: true }] }) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { headers: { "content-type": "application/json" } }));
  await assert.rejects(runDream({ model: loose, sources: [], memories: [], signal: new AbortController().signal }));
  let failures = 0;
  const unavailable = languageModel("openai-compatible", { baseURL: "https://dreaming.fixture/v1" }, "dream-model", async () => { failures++; return new Response("unavailable", { status: 503 }); });
  await assert.rejects(runDream({ model: unavailable, sources: [], memories: [], signal: new AbortController().signal }));
  assert.equal(failures, 1);
});

test("text-only chat receives private recalled data and dreaming hides new-memory proposals", async () => {
  let calls = 0;
  const model = languageModel("openai-compatible", { baseURL: "https://chat.fixture/v1" }, "chat-model", async (_url, init) => {
    calls++;
    const body = JSON.parse(init!.body as string);
    assert.equal(body.tools, undefined);
    const messages = JSON.stringify(body.messages);
    assert.ok(messages.includes("User likes pricing briefs."));
    assert.ok(messages.includes("untrusted data"));
    const data = { id: "fixture", object: "chat.completion.chunk", created: 1, model: "chat-model", choices: [{ index: 0, delta: { role: "assistant", content: "I'll keep your pricing brief concise." }, finish_reason: null }] };
    const stop = { ...data, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] };
    return new Response(`data: ${JSON.stringify(data)}\n\ndata: ${JSON.stringify(stop)}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
  });
  const bot = instantiateBot(mainBot); bot.grantedCapabilities = ["memory.read", "memory.write"];
  const result = await runModel({ model, modelRef: { connectionId: randomUUID(), modelId: "chat-model" }, bot,
    tools: false, dreamingEnabled: true, recalledMemory: [{ id: randomUUID(), botId: bot.id, source: "Dreaming", content: "User likes pricing briefs.", updatedAt: new Date().toISOString() }],
    messages: [{ role: "user", content: "What format do I like?" }], skills: [], loadSkill: () => { throw new Error("No skills"); }, readSkillResource: () => "", searchMemory: () => [], proposeMemory: () => { assert.fail("No memory proposal"); }, signal: new AbortController().signal,
  }, () => {});
  assert.match(result, /pricing brief/); assert.equal(calls, 1);
});
