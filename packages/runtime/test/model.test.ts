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
        loadSkill: () => ({ instructions: "", resources: [] }),
        readSkillResource: () => "",
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

test("board planning calls expose only the plan tool, honour budgets and report token usage", async () => {
  let calls = 0;
  const plans: unknown[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c);
    const payload = JSON.parse(Buffer.concat(chunks).toString());
    calls++;
    if (calls === 1) {
      assert.deepEqual(
        payload.tools.map(
          (t: { function: { name: string } }) => t.function.name,
        ),
        ["proposePlan"],
        "a coordinator's board call cannot create bots",
      );
      assert.equal(payload.max_tokens, 1234);
      assert.match(payload.messages[0].content, /BOARD BRIEFING/);
    }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const chunk = (
      delta: unknown,
      finish_reason: string | null = null,
      usage?: unknown,
    ) =>
      res.write(
        `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture-model", choices: [{ index: 0, delta, finish_reason }], ...(usage ? { usage } : {}) })}\n\n`,
      );
    const usage = {
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
    };
    if (calls === 1) {
      chunk({
        role: "assistant",
        tool_calls: [
          {
            index: 0,
            id: "call-1",
            type: "function",
            function: {
              name: "proposePlan",
              arguments: JSON.stringify({
                summary: "Research then write.",
                tasks: [
                  {
                    key: "research",
                    title: "Research",
                    instructions: "Find facts.",
                    assigneeId: "a",
                    dependsOn: [],
                    sourceIds: [],
                  },
                ],
              }),
            },
          },
        ],
      });
      chunk({}, "tool_calls", usage);
    } else {
      chunk({ role: "assistant", content: "Plan recorded." });
      chunk({}, "stop", usage);
    }
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address() as { port: number };
  try {
    let tokens = 0;
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
        messages: [{ role: "user", content: "Write a brief." }],
        skills: [],
        loadSkill: () => ({ instructions: "", resources: [] }),
        readSkillResource: () => "",
        signal: new AbortController().signal,
        briefing: "BOARD BRIEFING",
        limits: { maxSteps: 3, maxOutputTokens: 1234 },
        onUsage: (t) => (tokens += t),
        searchMemory: () => [],
        proposeMemory: () => ({ approvalId: "unused" }),
        proposePlan: (plan) => {
          plans.push(plan);
          return { accepted: true };
        },
      },
      () => {},
    );
    assert.equal(text, "Plan recorded.");
    assert.equal(plans.length, 1);
    assert.equal(tokens, 240);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
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
          proposeBot: () => ({ approvalId: "unused" }),
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
