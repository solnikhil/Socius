import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { instantiateBot, mainBot } from "@socius/marketplace";
import { runModel } from "../src/model.js";
import { languageModel } from "../src/providers/factory.js";

test("real AI SDK adapter streams text and routes a model tool call into a reviewed bot proposal", async () => {
  let calls = 0,
    proposals = 0;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c);
    const payload = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(req.url, "/v1/chat/completions");
    assert.equal(payload.model, "fixture-model");
    calls++;
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    function chunk(delta: unknown, finish_reason: string | null = null) {
      res.write(
        `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture-model", choices: [{ index: 0, delta, finish_reason }] })}\n\n`,
      );
    }
    if (calls === 1) {
      assert.ok(
        payload.tools.some(
          (t: { function: { name: string } }) =>
            t.function.name === "createBot",
        ),
      );
      chunk({
        role: "assistant",
        tool_calls: [
          {
            index: 0,
            id: "call-1",
            type: "function",
            function: {
              name: "createBot",
              arguments: JSON.stringify({
                name: "Planner",
                role: "Planning",
                instructions: "Create clear plans.",
              }),
            },
          },
        ],
      });
      chunk({}, "tool_calls");
    } else {
      chunk({ role: "assistant", content: "Review the proposed Planner bot." });
      chunk({}, "stop");
    }
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address() as { port: number };
  try {
    let streamed = "";
    const text = await runModel(
      {
        model: languageModel(
          "openai-compatible",
          { baseURL: `http://127.0.0.1:${address.port}/v1` },
          "fixture-model",
        ),
        modelRef: { connectionId: "fixture", modelId: "fixture-model" },
        tools: true,
        bot: instantiateBot(mainBot),
        messages: [{ role: "user", content: "Create a planning bot." }],
        skills: [],
        signal: new AbortController().signal,
        searchMemory: () => [],
        proposeMemory: () => ({ approvalId: "unused" }),
        proposeBot: (draft) => {
          assert.equal(draft.name, "Planner");
          proposals++;
          return { approvalId: "review-me" };
        },
      },
      (value) => {
        streamed = value;
      },
    );
    assert.equal(text, "Review the proposed Planner bot.");
    assert.equal(streamed, text);
    assert.equal(proposals, 1);
    assert.equal(calls, 2);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
