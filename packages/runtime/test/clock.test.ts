import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { instantiateBot, mainBot } from "@socius/marketplace";
import { isTimeZone, timeContext, timeFacts } from "../src/clock.js";
import { runModel } from "../src/model.js";
import { languageModel } from "../src/providers/factory.js";

// 20:30 UTC on Wednesday 14 Oct 2026 is already Thursday 02:00 in India.
const instant = new Date("2026-10-14T20:30:00Z");

test("time facts follow the requested zone, including date rollover and offsets", () => {
  assert.deepEqual(timeFacts(instant, "Asia/Kolkata"), {
    iso: "2026-10-14T20:30:00.000Z",
    timeZone: "Asia/Kolkata",
    utcOffset: "+05:30",
    weekday: "Thursday",
    date: "15 October 2026",
    time: "02:00",
  });
  const ny = timeFacts(instant, "America/New_York");
  assert.equal(ny.weekday, "Wednesday");
  assert.equal(ny.time, "16:30");
  assert.equal(ny.utcOffset, "-04:00");
  assert.equal(timeFacts(instant, "UTC").utcOffset, "+00:00");
  assert.ok(isTimeZone("Asia/Kolkata"));
  assert.ok(!isTimeZone("Mars/Olympus_Mons"));
  assert.match(
    timeContext(instant, "Asia/Kolkata"),
    /Thursday, 15 October 2026, 02:00 \(Asia\/Kolkata, UTC\+05:30\)/,
  );
});

test("every model call carries the current time, and getCurrentTime answers other zones", async () => {
  let calls = 0;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c);
    const payload = JSON.parse(Buffer.concat(chunks).toString());
    calls++;
    const system = JSON.stringify(
      payload.messages.filter((m: { role: string }) => m.role === "system"),
    );
    assert.match(system, /Thursday, 15 October 2026, 02:00 \(Asia\/Kolkata/);
    assert.ok(
      payload.tools.some(
        (t: { function: { name: string } }) =>
          t.function.name === "getCurrentTime",
      ),
    );
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const chunk = (delta: unknown, finish_reason: string | null = null) =>
      res.write(
        `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture-model", choices: [{ index: 0, delta, finish_reason }] })}\n\n`,
      );
    if (calls === 1) {
      chunk({
        role: "assistant",
        tool_calls: [
          {
            index: 0,
            id: "call-1",
            type: "function",
            function: {
              name: "getCurrentTime",
              arguments: JSON.stringify({ timeZone: "America/New_York" }),
            },
          },
        ],
      });
      chunk({}, "tool_calls");
    } else {
      const result = JSON.stringify(
        payload.messages.filter((m: { role: string }) => m.role === "tool"),
      );
      assert.match(result, /16:30/);
      assert.match(result, /-04:00/);
      chunk({ role: "assistant", content: "It is 16:30 in New York." });
      chunk({}, "stop");
    }
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as { port: number };
  try {
    const text = await runModel(
      {
        model: languageModel(
          "openai-compatible",
          { baseURL: `http://127.0.0.1:${port}/v1` },
          "fixture-model",
        ),
        modelRef: { connectionId: "fixture", modelId: "fixture-model" },
        tools: true,
        bot: instantiateBot(mainBot),
        messages: [{ role: "user", content: "What time is it in New York?" }],
        skills: [],
        loadSkill: () => ({ instructions: "", resources: [] }),
        readSkillResource: () => "",
        signal: new AbortController().signal,
        searchMemory: () => [],
        proposeMemory: () => ({ approvalId: "unused" }),
        now: () => instant,
        timeZone: "Asia/Kolkata",
      },
      () => {},
    );
    assert.equal(text, "It is 16:30 in New York.");
    assert.equal(calls, 2);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
