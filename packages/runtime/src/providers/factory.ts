import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createMistral } from "@ai-sdk/mistral";
import { createXai } from "@ai-sdk/xai";
import { createGroq } from "@ai-sdk/groq";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createCerebras } from "@ai-sdk/cerebras";
import { createFireworks } from "@ai-sdk/fireworks";
import { createTogetherAI } from "@ai-sdk/togetherai";
import { createPerplexity } from "@ai-sdk/perplexity";
import { createCohere } from "@ai-sdk/cohere";
import { createDeepInfra } from "@ai-sdk/deepinfra";
import { createGateway } from "@ai-sdk/gateway";
import { createBaseten } from "@ai-sdk/baseten";
import { createHuggingFace } from "@ai-sdk/huggingface";
import { createMoonshotAI } from "@ai-sdk/moonshotai";
import { createAlibaba } from "@ai-sdk/alibaba";
import { createMiniMax } from "@ai-sdk/minimax";
import { createZai } from "@ai-sdk/zai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import {
  provider as descriptor,
  type ProviderDescriptor,
  type ProviderId,
} from "@socius/contracts/providers";

/** Resolved field values (stored config, decrypted secrets, environment). */
export type Values = Record<string, string>;
export type Fetch = typeof globalThis.fetch;
type Factory = (
  v: Values,
  fetch: Fetch | undefined,
) => (id: string) => LanguageModel;

/** Copies only the named settings that have a value. */
const pick = (v: Values, ...keys: string[]): Record<string, string> =>
  Object.fromEntries(keys.filter((k) => v[k]).map((k) => [k, v[k]!]));
const withFetch = (fetch: Fetch | undefined) => (fetch ? { fetch } : {});
const keyed =
  (
    create: (s: {
      apiKey?: string;
      fetch?: Fetch;
    }) => (id: string) => LanguageModel,
  ): Factory =>
  (v, fetch) =>
    create({ ...pick(v, "apiKey"), ...withFetch(fetch) });
const compatible =
  (name: string): Factory =>
  (v, fetch) =>
    createOpenAICompatible({
      name,
      baseURL: v.baseURL ?? "",
      includeUsage: true,
      ...pick(v, "apiKey"),
      ...withFetch(fetch),
    });

/** One AI SDK factory per provider. Adding a provider id fails typecheck until wired here. */
const factories: Record<ProviderId, Factory> = {
  ollama: compatible("ollama"),
  lmstudio: compatible("lmstudio"),
  llamacpp: compatible("llamacpp"),
  "openai-compatible": compatible("custom"),
  openai: (v, fetch) =>
    createOpenAI({
      ...pick(v, "apiKey", "organization", "project"),
      ...withFetch(fetch),
    }),
  anthropic: keyed(createAnthropic),
  google: keyed(createGoogleGenerativeAI),
  mistral: keyed(createMistral),
  xai: keyed(createXai),
  groq: keyed(createGroq),
  deepseek: keyed(createDeepSeek),
  cerebras: keyed(createCerebras),
  fireworks: keyed(createFireworks),
  togetherai: keyed(createTogetherAI),
  perplexity: keyed(createPerplexity),
  cohere: keyed(createCohere),
  deepinfra: keyed(createDeepInfra),
  baseten: keyed(createBaseten),
  huggingface: keyed(createHuggingFace),
  moonshotai: keyed(createMoonshotAI),
  alibaba: keyed(createAlibaba),
  minimax: keyed(createMiniMax),
  zai: keyed(createZai),
  gateway: keyed(createGateway),
  azure: (v, fetch) =>
    createAzure({
      ...pick(v, "resourceName", "apiKey", "apiVersion"),
      ...withFetch(fetch),
    }),
  "amazon-bedrock": (v, fetch) =>
    createAmazonBedrock({
      ...pick(
        v,
        "region",
        "apiKey",
        "accessKeyId",
        "secretAccessKey",
        "sessionToken",
      ),
      ...withFetch(fetch),
    }),
  "google-vertex": (v, fetch) =>
    createVertex({
      ...pick(v, "project", "location", "apiKey"),
      ...withFetch(fetch),
    }),
  "google-vertex-anthropic": (v, fetch) =>
    createVertexAnthropic({
      ...pick(v, "project", "location"),
      ...withFetch(fetch),
    }),
  openrouter: (v, fetch) =>
    createOpenRouter({
      ...pick(v, "apiKey"),
      compatibility: "strict",
      appName: "Socius",
      ...withFetch(fetch),
    }),
};

export function languageModel(
  provider: ProviderId,
  values: Values,
  modelId: string,
  fetch?: Fetch,
): LanguageModel {
  return factories[provider](values, fetch)(modelId);
}

/**
 * Builds the values passed to a factory: stored config and secrets first,
 * then environment variables named by the descriptor, then defaults.
 */
export function resolveValues(
  d: ProviderDescriptor,
  config: Record<string, string>,
  secrets: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env,
): Values {
  const values: Values = {};
  for (const field of d.fields) {
    const value =
      (field.kind === "secret" ? secrets[field.key] : config[field.key]) ||
      (field.env ? env[field.env] : undefined) ||
      field.default;
    if (value) values[field.key] = value;
  }
  return values;
}

/** Fields whose value would come from the environment. Values are not exposed. */
export function envFields(
  id: ProviderId,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return descriptor(id)
    .fields.filter((f) => f.env && env[f.env])
    .map((f) => f.key);
}
