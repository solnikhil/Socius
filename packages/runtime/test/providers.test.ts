import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { APICallError, LoadAPIKeyError, generateText } from "ai";
import {
  PROVIDERS,
  PROVIDER_IDS,
  type ProviderId,
} from "@socius/contracts/providers";
import { languageModel, resolveValues } from "../src/providers/factory.js";
import {
  discoverModels,
  supportsDiscovery,
} from "../src/providers/discovery.js";
import { classify } from "../src/providers/errors.js";
import { checkModel } from "../src/providers/check.js";

const KEY = "sk-socius-test-0123456789";
/** Host each provider must call with the default settings. */
const HOSTS: Record<ProviderId, string> = {
  ollama: "127.0.0.1:11434",
  lmstudio: "127.0.0.1:1234",
  llamacpp: "127.0.0.1:8080",
  "openai-compatible": "llm.example.com",
  openai: "api.openai.com",
  anthropic: "api.anthropic.com",
  google: "generativelanguage.googleapis.com",
  mistral: "api.mistral.ai",
  xai: "api.x.ai",
  groq: "api.groq.com",
  deepseek: "api.deepseek.com",
  cerebras: "api.cerebras.ai",
  fireworks: "api.fireworks.ai",
  togetherai: "api.together.xyz",
  perplexity: "api.perplexity.ai",
  cohere: "api.cohere.com",
  deepinfra: "api.deepinfra.com",
  baseten: "inference.baseten.co",
  huggingface: "router.huggingface.co",
  moonshotai: "api.moonshot.ai",
  alibaba: "dashscope-intl.aliyuncs.com",
  minimax: "api.minimax.io",
  zai: "api.z.ai",
  azure: "socius-test.openai.azure.com",
  "amazon-bedrock": "bedrock-runtime.us-east-1.amazonaws.com",
  "google-vertex": "aiplatform.googleapis.com",
  "google-vertex-anthropic": "us-east5-aiplatform.googleapis.com",
  gateway: "ai-gateway.vercel.sh",
  openrouter: "openrouter.ai",
};
function fixtureValues(id: ProviderId) {
  const d = PROVIDERS.find((p) => p.id === id)!;
  const config: Record<string, string> = {},
    secrets: Record<string, string> = {};
  for (const f of d.fields) {
    if (f.kind === "secret") {
      if (f.key === "apiKey") secrets.apiKey = KEY;
    } else if (f.kind === "url")
      config[f.key] = f.default ?? "https://llm.example.com/v1";
    else if (f.key === "resourceName") config[f.key] = "socius-test";
    else if (f.key === "project") config[f.key] = "socius-project";
  }
  return resolveValues(d, config, secrets, {});
}
type Seen = { url: string; headers: Record<string, string> };
const recorder = (status: number, payload: unknown) => {
  const seen: Seen[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({
      url: String(input instanceof Request ? input.url : input),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
    });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof globalThis.fetch;
  return { seen, fetch };
};

test("descriptors cover every provider id exactly once, with valid fields", () => {
  assert.deepEqual(
    PROVIDERS.map((p) => p.id),
    [...PROVIDER_IDS],
  );
  for (const p of PROVIDERS) {
    assert.equal(
      new Set(p.fields.map((f) => f.key)).size,
      p.fields.length,
      p.id,
    );
    // The interface promises a model list only where the runtime can fetch one.
    assert.equal(p.discovery, supportsDiscovery(p.id), p.id);
  }
});

for (const id of PROVIDER_IDS) {
  if (id === "google-vertex-anthropic") continue; // ADC-only; covered below
  test(`${id}: the AI SDK provider calls its endpoint with the configured credential`, async () => {
    const { seen, fetch } = recorder(401, {
      error: { message: "Invalid API key", type: "authentication_error" },
    });
    const model = languageModel(id, fixtureValues(id), "socius-model", fetch);
    const error = await generateText({
      model,
      prompt: "hi",
      maxRetries: 0,
    }).then(
      () => assert.fail("expected the fixture to reject"),
      (e: unknown) => e,
    );
    assert.ok(seen.length >= 1, "no request was made");
    const call = seen.at(-1)!;
    assert.equal(new URL(call.url).host, HOSTS[id]);
    assert.ok(
      `${call.url} ${JSON.stringify(call.headers)}`.includes(KEY),
      "credential not sent",
    );
    const failure = classify(error, id);
    assert.equal(failure.code, "unauthorized", `${id}: ${failure.code}`);
    assert.doesNotMatch(failure.message, /Invalid API key/);
  });
}

test("Claude on Vertex builds a model without credentials until a request is made", () => {
  const model = languageModel(
    "google-vertex-anthropic",
    fixtureValues("google-vertex-anthropic"),
    "claude-sonnet-4-5@20250929",
  );
  assert.equal(typeof model, "object");
});

test("stored values win over environment variables, which win over defaults", () => {
  const d = PROVIDERS.find((p) => p.id === "amazon-bedrock")!;
  assert.deepEqual(
    resolveValues(
      d,
      {},
      { apiKey: "stored" },
      { AWS_BEARER_TOKEN_BEDROCK: "env", AWS_SESSION_TOKEN: "token" },
    ),
    { region: "us-east-1", apiKey: "stored", sessionToken: "token" },
  );
});

test("model discovery parses each catalog format and drops non-chat models", async () => {
  const cases: [ProviderId, unknown, string[], Record<string, unknown>?][] = [
    [
      "openai",
      {
        data: [
          { id: "gpt-x" },
          { id: "text-embedding-3-small" },
          { id: "whisper-1" },
          { id: "gpt-x" },
        ],
      },
      ["gpt-x"],
    ],
    [
      "anthropic",
      { data: [{ id: "claude-x", display_name: "Claude X" }] },
      ["claude-x"],
      { tools: true, name: "Claude X" },
    ],
    [
      "google",
      {
        models: [
          {
            name: "models/gemini-x",
            supportedGenerationMethods: ["generateContent"],
            inputTokenLimit: 1000,
          },
          {
            name: "models/embedding-001",
            supportedGenerationMethods: ["embedContent"],
          },
        ],
      },
      ["gemini-x"],
      { contextWindow: 1000 },
    ],
    [
      "cohere",
      { models: [{ name: "command-x", features: ["tools"] }] },
      ["command-x"],
      { tools: true },
    ],
    [
      "openrouter",
      {
        data: [
          {
            id: "vendor/model",
            name: "Vendor Model",
            context_length: 8000,
            supported_parameters: ["tools"],
          },
        ],
      },
      ["vendor/model"],
      { name: "Vendor Model", tools: true, contextWindow: 8000 },
    ],
    [
      "mistral",
      {
        data: [{ id: "mistral-x", capabilities: { function_calling: false } }],
      },
      ["mistral-x"],
      { tools: false },
    ],
    ["togetherai", [{ id: "org/model" }], ["org/model"]],
    [
      "gateway",
      {
        models: [
          {
            id: "openai/gpt-x",
            name: "GPT X",
            specification: {
              specificationVersion: "v4",
              provider: "openai",
              modelId: "gpt-x",
            },
            modelType: "language",
          },
          {
            id: "openai/text-embedding-3",
            name: "Embed",
            specification: {
              specificationVersion: "v4",
              provider: "openai",
              modelId: "text-embedding-3",
            },
            modelType: "embedding",
          },
        ],
      },
      ["openai/gpt-x"],
    ],
  ];
  for (const [id, payload, ids, first] of cases) {
    const { seen, fetch } = recorder(200, payload);
    const models = await discoverModels(id, fixtureValues(id), fetch);
    assert.deepEqual(
      models.map((m) => m.id),
      ids,
      id,
    );
    if (first)
      assert.deepEqual(
        { ...models[0], id: undefined },
        { id: undefined, ...first },
        id,
      );
    assert.ok(JSON.stringify(seen).includes(KEY), `${id} sent no credential`);
  }
});

test("local discovery uses the configured endpoint and a 401 is classified safely", async () => {
  const { seen, fetch } = recorder(200, { data: [{ id: "llama" }] });
  const models = await discoverModels(
    "ollama",
    { baseURL: "http://127.0.0.1:9999/v1" },
    fetch,
  );
  assert.deepEqual(models, [{ id: "llama" }]);
  assert.equal(seen[0]!.url, "http://127.0.0.1:9999/v1/models");
  assert.equal(seen[0]!.headers.authorization, undefined);
  const denied = recorder(401, { error: "bad key sk-leak" });
  const error = await discoverModels(
    "groq",
    { apiKey: KEY },
    denied.fetch,
  ).catch((e: unknown) => e);
  const failure = classify(error, "Groq");
  assert.equal(failure.code, "unauthorized");
  assert.doesNotMatch(failure.message, /sk-leak/);
});

test("errors are classified into stable codes without leaking bodies", async () => {
  const api = (statusCode: number, responseBody: string) =>
    new APICallError({
      message: responseBody,
      url: "https://x",
      requestBodyValues: { secret: "prompt" },
      statusCode,
      responseBody,
    });
  const cases: [unknown, string][] = [
    [api(401, "{}"), "unauthorized"],
    [api(403, "forbidden"), "forbidden"],
    [api(404, "no route"), "model_not_found"],
    [
      api(400, '{"error":"model \\"x\\" not found, try pulling it first"}'),
      "model_not_found",
    ],
    [api(429, "slow down"), "rate_limited"],
    [api(429, "You exceeded your current quota"), "quota_exceeded"],
    [api(402, "credits"), "quota_exceeded"],
    [
      api(
        400,
        '{"error":"registry.ollama.ai/library/gemma:2b does not support tools"}',
      ),
      "tools_unsupported",
    ],
    [
      api(400, "This model's maximum context length is 8192 tokens"),
      "context_too_long",
    ],
    [api(400, "bad field"), "invalid_request"],
    [api(503, "overloaded"), "provider_error"],
    [
      new LoadAPIKeyError({ message: "OPENAI_API_KEY missing" }),
      "credentials_missing",
    ],
    [Object.assign(new Error("x"), { name: "TimeoutError" }), "timeout"],
    [
      new Error("Could not load the default credentials."),
      "credentials_missing",
    ],
    [new Error("weird"), "unknown"],
  ];
  for (const [error, code] of cases) {
    const failure = classify(error, "Provider");
    assert.equal(failure.code, code, String((error as Error).message));
    assert.doesNotMatch(failure.message, /prompt|overloaded|bad field/);
  }
  // A real refused connection is reported as unreachable.
  const closed = createServer();
  await new Promise<void>((r) => closed.listen(0, "127.0.0.1", r));
  const { port } = closed.address() as { port: number };
  await new Promise<void>((r) => closed.close(() => r()));
  const refused = await generateText({
    model: languageModel(
      "ollama",
      { baseURL: `http://127.0.0.1:${port}/v1` },
      "m",
    ),
    prompt: "hi",
    maxRetries: 0,
  }).catch((e: unknown) => e);
  assert.equal(classify(refused, "Ollama").code, "unreachable");
  assert.equal(
    classify(new Error("x"), "P", { aborted: true }).code,
    "cancelled",
  );
});

test("model check verifies text and tool calling against a real endpoint", async () => {
  let toolsRequested = 0;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c);
    const payload = JSON.parse(Buffer.concat(chunks).toString());
    const message = payload.tools
      ? (toolsRequested++,
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: { name: "socius_check", arguments: '{"value":"ok"}' },
            },
          ],
        })
      : { role: "assistant", content: "OK" };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id: "x",
        object: "chat.completion",
        created: 1,
        model: payload.model,
        choices: [
          {
            index: 0,
            message,
            finish_reason: payload.tools ? "tool_calls" : "stop",
          },
        ],
      }),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    const { port } = server.address() as { port: number };
    const check = await checkModel(
      languageModel(
        "lmstudio",
        { baseURL: `http://127.0.0.1:${port}/v1` },
        "fixture",
      ),
      "LM Studio",
    );
    assert.equal(check.ok, true);
    assert.equal(check.tools, true);
    assert.equal(toolsRequested, 1);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
