// Model provider descriptors shared by the runtime (which owns the SDK
// factories) and the interface (which renders connection forms from them).
// Descriptors are data only: they never contain credentials or code.

export const PROVIDER_IDS = [
  "ollama",
  "lmstudio",
  "llamacpp",
  "openai",
  "anthropic",
  "google",
  "mistral",
  "xai",
  "groq",
  "deepseek",
  "cerebras",
  "fireworks",
  "togetherai",
  "perplexity",
  "cohere",
  "deepinfra",
  "baseten",
  "huggingface",
  "moonshotai",
  "alibaba",
  "minimax",
  "zai",
  "azure",
  "amazon-bedrock",
  "google-vertex",
  "google-vertex-anthropic",
  "gateway",
  "openrouter",
  "openai-compatible",
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export type ProviderCategory =
  "local" | "cloud" | "enterprise" | "gateway" | "custom";

export interface ProviderField {
  /** Setting name passed to the provider factory. */
  key: string;
  label: string;
  /** Secrets are encrypted at rest and never returned to the interface. */
  kind: "secret" | "text" | "url";
  required?: boolean;
  placeholder?: string;
  help?: string;
  default?: string;
  /** Environment variable used when no value is stored. */
  env?: string;
}

export interface ProviderDescriptor {
  id: ProviderId;
  name: string;
  category: ProviderCategory;
  description: string;
  /** npm package that implements the provider. */
  package: string;
  docsURL: string;
  keyURL?: string;
  fields: ProviderField[];
  /** Whether the runtime can list models from the provider. */
  discovery: boolean;
  modelPlaceholder: string;
  /** Where chat context is sent, for the privacy notice. */
  destination: "local" | "endpoint" | "cloud";
}

const key = (env: string, required = false): ProviderField => ({
  key: "apiKey",
  label: "API key",
  kind: "secret",
  required,
  env,
});
const cloud = (
  id: ProviderId,
  name: string,
  description: string,
  pkg: string,
  env: string,
  docsURL: string,
  keyURL: string,
  modelPlaceholder: string,
  discovery = true,
  extra: ProviderField[] = [],
): ProviderDescriptor => ({
  id,
  name,
  category: "cloud",
  description,
  package: pkg,
  docsURL,
  keyURL,
  fields: [key(env, true), ...extra],
  discovery,
  modelPlaceholder,
  destination: "cloud",
});
const local = (
  id: ProviderId,
  name: string,
  description: string,
  baseURL: string,
  docsURL: string,
  modelPlaceholder: string,
): ProviderDescriptor => ({
  id,
  name,
  category: "local",
  description,
  package: "@ai-sdk/openai-compatible",
  docsURL,
  fields: [
    {
      key: "baseURL",
      label: "Endpoint",
      kind: "url",
      required: true,
      default: baseURL,
      help: "OpenAI-compatible API root. Remote endpoints require HTTPS.",
    },
    {
      key: "apiKey",
      label: "API key",
      kind: "secret",
      help: "Only needed when the server requires one.",
    },
  ],
  discovery: true,
  modelPlaceholder,
  destination: "endpoint",
});

export const PROVIDERS: readonly ProviderDescriptor[] = [
  local(
    "ollama",
    "Ollama",
    "Run open models on this computer.",
    "http://127.0.0.1:11434/v1",
    "https://docs.ollama.com/api/openai-compatibility",
    "llama3.2",
  ),
  local(
    "lmstudio",
    "LM Studio",
    "Serve downloaded models from LM Studio’s local server.",
    "http://127.0.0.1:1234/v1",
    "https://lmstudio.ai/docs/app/api/endpoints/openai",
    "qwen2.5-7b-instruct",
  ),
  local(
    "llamacpp",
    "llama.cpp",
    "Connect to a llama.cpp server.",
    "http://127.0.0.1:8080/v1",
    "https://github.com/ggml-org/llama.cpp/tree/master/tools/server",
    "default",
  ),
  cloud(
    "openai",
    "OpenAI",
    "GPT and reasoning models from OpenAI.",
    "@ai-sdk/openai",
    "OPENAI_API_KEY",
    "https://ai-sdk.dev/providers/ai-sdk-providers/openai",
    "https://platform.openai.com/api-keys",
    "gpt-5-mini",
    true,
    [
      {
        key: "organization",
        label: "Organization ID",
        kind: "text",
        placeholder: "Optional",
      },
      {
        key: "project",
        label: "Project ID",
        kind: "text",
        placeholder: "Optional",
      },
    ],
  ),
  cloud(
    "anthropic",
    "Anthropic",
    "Claude models from Anthropic.",
    "@ai-sdk/anthropic",
    "ANTHROPIC_API_KEY",
    "https://ai-sdk.dev/providers/ai-sdk-providers/anthropic",
    "https://console.anthropic.com/settings/keys",
    "claude-sonnet-4-5",
  ),
  cloud(
    "google",
    "Google Gemini",
    "Gemini models through the Gemini API.",
    "@ai-sdk/google",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai",
    "https://aistudio.google.com/apikey",
    "gemini-2.5-flash",
  ),
  cloud(
    "mistral",
    "Mistral",
    "Mistral and Codestral models.",
    "@ai-sdk/mistral",
    "MISTRAL_API_KEY",
    "https://ai-sdk.dev/providers/ai-sdk-providers/mistral",
    "https://console.mistral.ai/api-keys",
    "mistral-large-latest",
  ),
  cloud(
    "xai",
    "xAI",
    "Grok models from xAI.",
    "@ai-sdk/xai",
    "XAI_API_KEY",
    "https://ai-sdk.dev/providers/ai-sdk-providers/xai",
    "https://console.x.ai",
    "grok-4",
  ),
  cloud(
    "groq",
    "Groq",
    "Fast inference for open models on Groq.",
    "@ai-sdk/groq",
    "GROQ_API_KEY",
    "https://ai-sdk.dev/providers/ai-sdk-providers/groq",
    "https://console.groq.com/keys",
    "llama-3.3-70b-versatile",
  ),
  cloud(
    "deepseek",
    "DeepSeek",
    "DeepSeek chat and reasoning models.",
    "@ai-sdk/deepseek",
    "DEEPSEEK_API_KEY",
    "https://ai-sdk.dev/providers/ai-sdk-providers/deepseek",
    "https://platform.deepseek.com/api_keys",
    "deepseek-chat",
  ),
  cloud(
    "cerebras",
    "Cerebras",
    "Open models on Cerebras inference.",
    "@ai-sdk/cerebras",
    "CEREBRAS_API_KEY",
    "https://ai-sdk.dev/providers/ai-sdk-providers/cerebras",
    "https://cloud.cerebras.ai",
    "llama-3.3-70b",
  ),
  cloud(
    "fireworks",
    "Fireworks",
    "Open models hosted by Fireworks AI.",
    "@ai-sdk/fireworks",
    "FIREWORKS_API_KEY",
    "https://ai-sdk.dev/providers/ai-sdk-providers/fireworks",
    "https://fireworks.ai/account/api-keys",
    "accounts/fireworks/models/llama-v3p3-70b-instruct",
  ),
  cloud(
    "togetherai",
    "Together AI",
    "Open models hosted by Together AI.",
    "@ai-sdk/togetherai",
    "TOGETHER_API_KEY",
    "https://ai-sdk.dev/providers/ai-sdk-providers/togetherai",
    "https://api.together.ai/settings/api-keys",
    "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  ),
  cloud(
    "perplexity",
    "Perplexity",
    "Sonar models with built-in web search.",
    "@ai-sdk/perplexity",
    "PERPLEXITY_API_KEY",
    "https://ai-sdk.dev/providers/ai-sdk-providers/perplexity",
    "https://www.perplexity.ai/settings/api",
    "sonar-pro",
    false,
  ),
  cloud(
    "cohere",
    "Cohere",
    "Command models from Cohere.",
    "@ai-sdk/cohere",
    "COHERE_API_KEY",
    "https://ai-sdk.dev/providers/ai-sdk-providers/cohere",
    "https://dashboard.cohere.com/api-keys",
    "command-a-03-2025",
  ),
  cloud(
    "deepinfra",
    "DeepInfra",
    "Open models hosted by DeepInfra.",
    "@ai-sdk/deepinfra",
    "DEEPINFRA_API_KEY",
    "https://ai-sdk.dev/providers/ai-sdk-providers/deepinfra",
    "https://deepinfra.com/dash/api_keys",
    "meta-llama/Llama-3.3-70B-Instruct",
  ),
  cloud(
    "baseten",
    "Baseten",
    "Model APIs hosted by Baseten.",
    "@ai-sdk/baseten",
    "BASETEN_API_KEY",
    "https://ai-sdk.dev/providers/ai-sdk-providers/baseten",
    "https://app.baseten.co/settings/api_keys",
    "deepseek-ai/DeepSeek-V3-0324",
  ),
  cloud(
    "huggingface",
    "Hugging Face",
    "Inference Providers through the Hugging Face router.",
    "@ai-sdk/huggingface",
    "HUGGINGFACE_API_KEY",
    "https://ai-sdk.dev/providers/ai-sdk-providers/huggingface",
    "https://huggingface.co/settings/tokens",
    "meta-llama/Llama-3.3-70B-Instruct",
  ),
  cloud(
    "moonshotai",
    "Moonshot AI",
    "Kimi models from Moonshot AI.",
    "@ai-sdk/moonshotai",
    "MOONSHOT_API_KEY",
    "https://ai-sdk.dev/providers/ai-sdk-providers/moonshotai",
    "https://platform.moonshot.ai/console/api-keys",
    "kimi-k2-0905-preview",
  ),
  cloud(
    "alibaba",
    "Alibaba Qwen",
    "Qwen models through Alibaba Cloud Model Studio (international).",
    "@ai-sdk/alibaba",
    "ALIBABA_API_KEY",
    "https://ai-sdk.dev/providers/ai-sdk-providers/alibaba",
    "https://modelstudio.console.alibabacloud.com",
    "qwen-plus",
  ),
  cloud(
    "minimax",
    "MiniMax",
    "MiniMax models.",
    "@ai-sdk/minimax",
    "MINIMAX_API_KEY",
    "https://ai-sdk.dev/providers/ai-sdk-providers/minimax",
    "https://platform.minimax.io",
    "MiniMax-M2",
    false,
  ),
  cloud(
    "zai",
    "Z.ai",
    "GLM models from Z.ai.",
    "@ai-sdk/zai",
    "ZAI_API_KEY",
    "https://ai-sdk.dev/providers/ai-sdk-providers/zai",
    "https://z.ai/manage-apikey/apikey-list",
    "glm-4.6",
    false,
  ),
  {
    id: "azure",
    name: "Azure OpenAI",
    category: "enterprise",
    description: "OpenAI models deployed in your Azure resource.",
    package: "@ai-sdk/azure",
    docsURL: "https://ai-sdk.dev/providers/ai-sdk-providers/azure",
    keyURL: "https://portal.azure.com",
    fields: [
      {
        key: "resourceName",
        label: "Resource name",
        kind: "text",
        required: true,
        env: "AZURE_RESOURCE_NAME",
        help: "The name in https://<resource>.openai.azure.com.",
      },
      key("AZURE_API_KEY", true),
      {
        key: "apiVersion",
        label: "API version",
        kind: "text",
        placeholder: "Optional · defaults to v1",
      },
    ],
    discovery: false,
    modelPlaceholder: "Your deployment name",
    destination: "cloud",
  },
  {
    id: "amazon-bedrock",
    name: "Amazon Bedrock",
    category: "enterprise",
    description: "Foundation models in your AWS account.",
    package: "@ai-sdk/amazon-bedrock",
    docsURL: "https://ai-sdk.dev/providers/ai-sdk-providers/amazon-bedrock",
    keyURL: "https://console.aws.amazon.com/bedrock",
    fields: [
      {
        key: "region",
        label: "Region",
        kind: "text",
        required: true,
        default: "us-east-1",
        env: "AWS_REGION",
      },
      {
        key: "apiKey",
        label: "Bedrock API key",
        kind: "secret",
        env: "AWS_BEARER_TOKEN_BEDROCK",
        help: "Use a Bedrock API key, or an access key pair below.",
      },
      {
        key: "accessKeyId",
        label: "Access key ID",
        kind: "secret",
        env: "AWS_ACCESS_KEY_ID",
      },
      {
        key: "secretAccessKey",
        label: "Secret access key",
        kind: "secret",
        env: "AWS_SECRET_ACCESS_KEY",
      },
      {
        key: "sessionToken",
        label: "Session token",
        kind: "secret",
        env: "AWS_SESSION_TOKEN",
        help: "Only for temporary credentials.",
      },
    ],
    discovery: false,
    modelPlaceholder: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    destination: "cloud",
  },
  {
    id: "google-vertex",
    name: "Google Vertex AI",
    category: "enterprise",
    description: "Gemini models in your Google Cloud project.",
    package: "@ai-sdk/google-vertex",
    docsURL: "https://ai-sdk.dev/providers/ai-sdk-providers/google-vertex",
    keyURL: "https://console.cloud.google.com/vertex-ai",
    fields: [
      {
        key: "project",
        label: "Project ID",
        kind: "text",
        env: "GOOGLE_VERTEX_PROJECT",
        help: "Required unless you use an express-mode API key.",
      },
      {
        key: "location",
        label: "Location",
        kind: "text",
        default: "us-central1",
        env: "GOOGLE_VERTEX_LOCATION",
      },
      {
        key: "apiKey",
        label: "Express-mode API key",
        kind: "secret",
        env: "GOOGLE_VERTEX_API_KEY",
        help: "Leave blank to use Application Default Credentials (gcloud auth application-default login).",
      },
    ],
    discovery: false,
    modelPlaceholder: "gemini-2.5-flash",
    destination: "cloud",
  },
  {
    id: "google-vertex-anthropic",
    name: "Claude on Vertex AI",
    category: "enterprise",
    description: "Anthropic Claude models in your Google Cloud project.",
    package: "@ai-sdk/google-vertex",
    docsURL:
      "https://ai-sdk.dev/providers/ai-sdk-providers/google-vertex#google-vertex-anthropic-provider-usage",
    keyURL: "https://console.cloud.google.com/vertex-ai",
    fields: [
      {
        key: "project",
        label: "Project ID",
        kind: "text",
        required: true,
        env: "GOOGLE_VERTEX_PROJECT",
      },
      {
        key: "location",
        label: "Location",
        kind: "text",
        default: "us-east5",
        env: "GOOGLE_VERTEX_LOCATION",
        help: "Uses Application Default Credentials (gcloud auth application-default login).",
      },
    ],
    discovery: false,
    modelPlaceholder: "claude-sonnet-4-5@20250929",
    destination: "cloud",
  },
  {
    id: "gateway",
    name: "Vercel AI Gateway",
    category: "gateway",
    description: "Hundreds of models from many providers through one key.",
    package: "@ai-sdk/gateway",
    docsURL: "https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway",
    keyURL: "https://vercel.com/d?to=/[team]/~/ai/api-keys",
    fields: [key("AI_GATEWAY_API_KEY", true)],
    discovery: true,
    modelPlaceholder: "openai/gpt-5-mini",
    destination: "cloud",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    category: "gateway",
    description: "Models from many providers through OpenRouter.",
    package: "@openrouter/ai-sdk-provider",
    docsURL: "https://ai-sdk.dev/providers/community-providers/openrouter",
    keyURL: "https://openrouter.ai/settings/keys",
    fields: [key("OPENROUTER_API_KEY", true)],
    discovery: true,
    modelPlaceholder: "anthropic/claude-sonnet-4.5",
    destination: "cloud",
  },
  {
    id: "openai-compatible",
    name: "OpenAI-compatible",
    category: "custom",
    description: "Any server that implements the OpenAI chat completions API.",
    package: "@ai-sdk/openai-compatible",
    docsURL: "https://ai-sdk.dev/providers/openai-compatible-providers",
    fields: [
      {
        key: "baseURL",
        label: "Endpoint",
        kind: "url",
        required: true,
        placeholder: "https://example.com/v1",
        help: "API root that serves /chat/completions. Remote endpoints require HTTPS.",
      },
      {
        key: "apiKey",
        label: "API key",
        kind: "secret",
        help: "Sent as a Bearer token. Optional.",
      },
    ],
    discovery: true,
    modelPlaceholder: "model-id",
    destination: "endpoint",
  },
];

const byId = new Map(PROVIDERS.map((p) => [p.id, p]));
export function provider(id: ProviderId): ProviderDescriptor {
  const descriptor = byId.get(id);
  if (!descriptor) throw new Error(`Unknown provider ${id}`);
  return descriptor;
}
export const isProviderId = (value: string): value is ProviderId =>
  byId.has(value as ProviderId);

export const PROVIDER_ERROR_CODES = [
  "credentials_missing",
  "unauthorized",
  "forbidden",
  "model_not_found",
  "rate_limited",
  "quota_exceeded",
  "unreachable",
  "timeout",
  "invalid_request",
  "tools_unsupported",
  "context_too_long",
  "provider_error",
  "cancelled",
  "no_output",
  "unknown",
] as const;
export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[number];

export interface CheckResult {
  ok: boolean;
  checkedAt: string;
  /** Safe, user-facing summary. Never contains provider response bodies. */
  message: string;
  code?: ProviderErrorCode;
}
export interface ConnectionStatus extends CheckResult {
  modelCount?: number;
}
export interface ModelCheck extends CheckResult {
  /** `null` when tool support could not be determined. */
  tools: boolean | null;
  latencyMs?: number;
}

/** A provider account or endpoint. Secret values never leave the runtime. */
export interface ProviderConnection {
  id: string;
  provider: ProviderId;
  label: string;
  /** Non-secret field values. */
  config: Record<string, string>;
  /** Secret fields that have a stored value. */
  secrets: string[];
  /** Fields satisfied by an environment variable. */
  env: string[];
  status: ConnectionStatus | null;
  createdAt: string;
  updatedAt: string;
}
export interface DiscoveredModel {
  id: string;
  name?: string;
  tools?: boolean | null;
  contextWindow?: number;
}
export interface DiscoveryResult {
  models: DiscoveredModel[];
  fetchedAt: string;
}
export interface ModelRef {
  connectionId: string;
  modelId: string;
}
/** A model the user added and can select for chats. */
export interface ModelEntry extends ModelRef {
  label: string;
  source: "discovered" | "manual";
  tools: boolean | null;
  check: ModelCheck | null;
  addedAt: string;
}
export interface ModelSelection {
  default: ModelRef | null;
  /** Bot id → model override. */
  bots: Record<string, ModelRef>;
}
