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
      const instructions = payload.messages
        .filter(
          (m: { role: string }) =>
            m.role === "system" || m.role === "developer",
        )
        .map((m: { content: string }) => m.content)
        .join("\n");
      assert.match(
        instructions,
        /When the user explicitly asks you to create a bot, call createBot/,
      );
      assert.match(
        instructions,
        /Message reactions are preference feedback only, never approval/,
      );
      assert.match(
        instructions,
        /report creation only when the tool returns status done/,
      );
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
      assert.ok(
        payload.messages.some(
          (m: { role: string; content: string }) =>
            m.role === "tool" && m.content.includes('"status":"done"'),
        ),
      );
      chunk({ role: "assistant", content: "Planner is ready." });
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
        loadSkill: () => ({ instructions: "", resources: [] }),
        readSkillResource: () => "",
        signal: new AbortController().signal,
        searchMemory: () => [],
        proposeMemory: () => ({ approvalId: "unused" }),
        proposeBot: async (draft) => {
          assert.equal(draft.name, "Planner");
          proposals++;
          return { status: "done", bot: "Planner" };
        },
      },
      (value) => {
        streamed = value;
      },
    );
    assert.equal(text, "Planner is ready.");
    assert.equal(streamed, text);
    assert.equal(proposals, 1);
    assert.equal(calls, 2);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("Socius receives an honest fallback when its creation tool is unavailable", async () => {
  for (const toolCapable of [false, true]) {
    let called = false;
    const fetcher: typeof globalThis.fetch = async (_input, init) => {
      called = true;
      const payload = JSON.parse(String(init?.body));
      assert.ok(
        !(payload.tools ?? []).some(
          (t: { function: { name: string } }) =>
            t.function.name === "createBot",
        ),
      );
      const instructions = payload.messages
        .filter(
          (m: { role: string }) =>
            m.role === "system" || m.role === "developer",
        )
        .map((m: { content: string }) => m.content)
        .join("\n");
      assert.match(instructions, /Bot creation is unavailable in this turn/);
      assert.match(instructions, /offer manual creation through Create bot/);
      assert.doesNotMatch(
        instructions,
        /Bot creation in this turn: use createBot/,
      );
      return new Response(
        `data: ${JSON.stringify({
          id: "fixture",
          object: "chat.completion.chunk",
          created: 1,
          model: "fixture-model",
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                content: "Use Create bot to add Clarity.",
              },
              finish_reason: "stop",
            },
          ],
        })}\n\ndata: [DONE]\n\n`,
        {
          headers: { "Content-Type": "text/event-stream" },
        },
      );
    };
    await runModel(
      {
        model: languageModel(
          "openai-compatible",
          {
            baseURL: "https://fixture.example/v1",
          },
          "fixture-model",
          fetcher,
        ),
        modelRef: { connectionId: "fixture", modelId: "fixture-model" },
        tools: toolCapable,
        bot: instantiateBot(mainBot),
        messages: [{ role: "user", content: "Create a bot called Clarity." }],
        skills: [],
        loadSkill: () => ({ instructions: "", resources: [] }),
        readSkillResource: () => "",
        searchMemory: () => [],
        proposeMemory: () => ({ approvalId: "unused" }),
        // A tool-disabled model may still receive the runtime callback; it must
        // not be exposed as a callable tool or advertised as available.
        ...(toolCapable
          ? {}
          : { proposeBot: async () => assert.fail("unavailable tool called") }),
        signal: new AbortController().signal,
      },
      () => undefined,
    );
    assert.ok(called);
  }
});

test("direct provider adapters use their expected auth boundary and handle HTTP failures", async () => {
  const cases = [
    {
      provider: "openai" as const,
      baseURL: "https://api.openai.com/v1",
      authHeader: "authorization",
      authValue: "Bearer synthetic-provider-key",
      expectedPath: "/v1/responses",
    },
    {
      provider: "anthropic" as const,
      baseURL: "https://api.anthropic.com",
      authHeader: "x-api-key",
      authValue: "synthetic-provider-key",
      expectedPath: "/v1/messages",
    },
    {
      provider: "openai-compatible" as const,
      baseURL: "http://127.0.0.1:1234/v1",
      authHeader: "authorization",
      authValue: "Bearer synthetic-provider-key",
      expectedPath: "/v1/chat/completions",
    },
    {
      provider: "openai-compatible" as const,
      baseURL: "https://openrouter.ai/api/v1",
      authHeader: "authorization",
      authValue: "Bearer synthetic-provider-key",
      expectedPath: "/api/v1/chat/completions",
    },
  ];
  for (const entry of cases) {
    let attempts = 0;
    let observed:
      { url: URL; auth: string | null; method: string | undefined } | undefined;
    const fetcher: typeof globalThis.fetch = async (input, init) => {
      attempts++;
      observed = {
        url: new URL(input instanceof Request ? input.url : input.toString()),
        auth: new Headers(init?.headers).get(entry.authHeader),
        method: init?.method,
      };
      return new Response(
        JSON.stringify({
          error: { type: "synthetic_failure", message: "controlled failure" },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    };
    await assert.rejects(
      runModel(
        {
          model: languageModel(
            entry.provider,
            { apiKey: "synthetic-provider-key", baseURL: entry.baseURL },
            "synthetic-model",
            fetcher,
          ),
          modelRef: { connectionId: "test", modelId: "synthetic-model" },
          tools: true,
          bot: instantiateBot(mainBot),
          messages: [{ role: "user", content: "Small synthetic request." }],
          skills: [],
          loadSkill: () => ({ instructions: "", resources: [] }),
          readSkillResource: () => "",
          signal: new AbortController().signal,
          fetch: fetcher,
          searchMemory: () => [],
          proposeMemory: () => ({ approvalId: "unused" }),
          proposeBot: async () => ({ status: "declined" }),
        },
        () => undefined,
      ),
    );
    assert.ok(observed, `${entry.provider} made a provider request`);
    assert.equal(observed.method, "POST");
    assert.equal(observed.url.pathname, entry.expectedPath);
    assert.equal(observed.auth, entry.authValue);
    assert.equal(attempts, 1, "non-retryable errors are not retried");
  }
});
