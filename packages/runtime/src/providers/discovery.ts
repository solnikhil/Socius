import { APICallError } from "ai";
import { createGateway } from "@ai-sdk/gateway";
import type { DiscoveredModel, ProviderId } from "@socius/contracts/providers";
import type { Fetch, Values } from "./factory.js";

/** OpenAI-style `GET {base}/models` roots for providers that expose one. */
const LIST_ROOTS: Partial<Record<ProviderId, string>> = {
  openai: "https://api.openai.com/v1",
  mistral: "https://api.mistral.ai/v1",
  xai: "https://api.x.ai/v1",
  groq: "https://api.groq.com/openai/v1",
  deepseek: "https://api.deepseek.com",
  cerebras: "https://api.cerebras.ai/v1",
  fireworks: "https://api.fireworks.ai/inference/v1",
  togetherai: "https://api.together.xyz/v1",
  deepinfra: "https://api.deepinfra.com/v1/openai",
  baseten: "https://inference.baseten.co/v1",
  huggingface: "https://router.huggingface.co/v1",
  moonshotai: "https://api.moonshot.ai/v1",
  alibaba: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  openrouter: "https://openrouter.ai/api/v1",
};
const ENDPOINT_PROVIDERS = new Set<ProviderId>([
  "ollama",
  "lmstudio",
  "llamacpp",
  "openai-compatible",
]);
const MAX_BYTES = 16 * 1024 * 1024;
const TIMEOUT_MS = 15000;
/** Model families that cannot hold a chat (embeddings, audio, images, moderation). */
const NON_CHAT =
  /(^|[-/_.])(embed|embedding|whisper|tts|dall-e|gpt-image|imagen|moderation|transcribe|rerank|realtime|sora|babbage|davinci)([-/_.]|$)|text-embedding|omni-moderation|-tts\b/i;

export function supportsDiscovery(id: ProviderId) {
  return (
    ENDPOINT_PROVIDERS.has(id) ||
    id in LIST_ROOTS ||
    ["anthropic", "google", "cohere", "gateway"].includes(id)
  );
}

async function getJSON(
  url: string,
  headers: Record<string, string>,
  fetch: Fetch,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", ...headers },
    signal,
    redirect: "error",
  });
  const text = await response.text();
  if (text.length > MAX_BYTES)
    throw new APICallError({
      message: "Model list too large",
      url,
      requestBodyValues: {},
      statusCode: 502,
    });
  if (!response.ok)
    throw new APICallError({
      message: `Model list request failed with ${response.status}`,
      url,
      requestBodyValues: {},
      statusCode: response.status,
      responseBody: text,
    });
  try {
    return JSON.parse(text);
  } catch {
    throw new APICallError({
      message: "Model list was not JSON",
      url,
      requestBodyValues: {},
      statusCode: 502,
    });
  }
}

type Row = Record<string, unknown>;
const rows = (value: unknown, key = "data"): Row[] => {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? (value as Row)[key]
      : undefined;
  return Array.isArray(list)
    ? list.filter((r): r is Row => !!r && typeof r === "object")
    : [];
};
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
function entry(
  id: string,
  name?: string,
  tools?: boolean | null,
  contextWindow?: number,
): DiscoveredModel {
  return {
    id,
    ...(name && name !== id ? { name } : {}),
    ...(tools !== undefined ? { tools } : {}),
    ...(contextWindow ? { contextWindow } : {}),
  };
}

function fromOpenAIList(body: unknown): DiscoveredModel[] {
  return rows(body).flatMap((r) => {
    const id = str(r.id);
    if (!id) return [];
    const params = r.supported_parameters;
    const caps = r.capabilities as Row | undefined;
    const tools = Array.isArray(params)
      ? params.includes("tools")
      : typeof caps?.function_calling === "boolean"
        ? caps.function_calling
        : undefined;
    return [
      entry(
        id,
        str(r.name) ?? str(r.display_name),
        tools,
        num(r.context_length) ??
          num(r.context_window) ??
          num(r.max_context_length),
      ),
    ];
  });
}

/**
 * Lists chat models available to a connection. Uses the provider's own model
 * catalog API (or the AI SDK gateway client); never guesses from a static list.
 */
export async function discoverModels(
  id: ProviderId,
  v: Values,
  fetch: Fetch = globalThis.fetch,
  signal: AbortSignal = AbortSignal.timeout(TIMEOUT_MS),
): Promise<DiscoveredModel[]> {
  const bearer: Record<string, string> = v.apiKey
    ? { Authorization: `Bearer ${v.apiKey}` }
    : {};
  let models: DiscoveredModel[];
  if (ENDPOINT_PROVIDERS.has(id) || LIST_ROOTS[id]) {
    const root =
      (ENDPOINT_PROVIDERS.has(id) ? v.baseURL : LIST_ROOTS[id]) ?? "";
    models = fromOpenAIList(
      await getJSON(
        `${root.replace(/\/+$/, "")}/models`,
        bearer,
        fetch,
        signal,
      ),
    );
  } else if (id === "anthropic") {
    const body = await getJSON(
      "https://api.anthropic.com/v1/models?limit=1000",
      {
        ...(v.apiKey ? { "x-api-key": v.apiKey } : {}),
        "anthropic-version": "2023-06-01",
      },
      fetch,
      signal,
    );
    models = rows(body).flatMap((r) =>
      str(r.id) ? [entry(r.id as string, str(r.display_name), true)] : [],
    );
  } else if (id === "google") {
    models = [];
    let page: string | undefined;
    for (let i = 0; i < 5; i++) {
      const body = (await getJSON(
        `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`,
        v.apiKey ? { "x-goog-api-key": v.apiKey } : {},
        fetch,
        signal,
      )) as Row;
      for (const r of rows(body, "models")) {
        const methods = r.supportedGenerationMethods;
        const name = str(r.name);
        if (
          !name ||
          (Array.isArray(methods) && !methods.includes("generateContent"))
        )
          continue;
        models.push(
          entry(
            name.replace(/^models\//, ""),
            str(r.displayName),
            undefined,
            num(r.inputTokenLimit),
          ),
        );
      }
      page = str(body?.nextPageToken);
      if (!page) break;
    }
  } else if (id === "cohere") {
    const body = await getJSON(
      "https://api.cohere.com/v1/models?endpoint=chat&page_size=1000",
      bearer,
      fetch,
      signal,
    );
    models = rows(body, "models").flatMap((r) => {
      const name = str(r.name);
      if (!name) return [];
      const features = r.features;
      return [
        entry(
          name,
          undefined,
          Array.isArray(features) ? features.includes("tools") : undefined,
          num(r.context_length),
        ),
      ];
    });
  } else if (id === "gateway") {
    const metadata = await createGateway({
      ...(v.apiKey ? { apiKey: v.apiKey } : {}),
      fetch: ((input, init) => fetch(input, { ...init, signal })) as Fetch,
    }).getAvailableModels();
    models = metadata.models
      .filter((m) => !m.modelType || m.modelType === "language")
      .map((m) => entry(m.id, m.name));
  } else {
    throw new Error(`Model discovery is unavailable for ${id}`);
  }
  const unique = new Map<string, DiscoveredModel>();
  for (const m of models) if (!NON_CHAT.test(m.id)) unique.set(m.id, m);
  return [...unique.values()].sort((a, b) => a.id.localeCompare(b.id));
}
