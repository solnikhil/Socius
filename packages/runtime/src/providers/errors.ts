import {
  APICallError,
  LoadAPIKeyError,
  LoadSettingError,
  NoSuchModelError,
} from "ai";
import type { ProviderErrorCode } from "@socius/contracts/providers";

/** A failure with a stable code and a message safe to show and persist. */
export class ProviderFailure extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProviderFailure";
  }
}

const messages: Record<ProviderErrorCode, (name: string) => string> = {
  credentials_missing: (n) =>
    `${n} needs credentials. Add them in Settings → Providers.`,
  unauthorized: (n) =>
    `${n} rejected the credentials. Check the key in Settings → Providers.`,
  forbidden: (n) =>
    `${n} denied access. Check that the account can use this model.`,
  model_not_found: (n) =>
    `${n} could not find this model. Check the model ID or refresh the model list.`,
  rate_limited: (n) => `${n} is rate limiting requests. Wait and try again.`,
  quota_exceeded: (n) =>
    `${n} reports insufficient quota or credit. Check billing for the account.`,
  unreachable: (n) =>
    `Could not reach ${n}. Check the endpoint, your network, and that the server is running.`,
  timeout: (n) => `${n} did not respond in time.`,
  invalid_request: (n) =>
    `${n} rejected the request. The model may not support this kind of request.`,
  tools_unsupported: () =>
    "This model does not support tool calling. Choose a tool-capable model for bots that propose bots or use memory.",
  context_too_long: () =>
    "The conversation is longer than this model’s context window.",
  provider_error: (n) => `${n} returned a server error. Try again later.`,
  cancelled: () => "Task cancelled.",
  no_output: () =>
    "The model returned no text. Try again or choose another model.",
  unknown: (n) =>
    `The request to ${n} failed. Test the connection in Settings → Providers.`,
};
export const failureMessage = (code: ProviderErrorCode, providerName: string) =>
  messages[code](providerName);

const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

/** AI Gateway reports typed errors by name. */
const GATEWAY: Record<string, ProviderErrorCode> = {
  GatewayAuthenticationError: "unauthorized",
  GatewayForbiddenError: "forbidden",
  GatewayInvalidRequestError: "invalid_request",
  GatewayRateLimitError: "rate_limited",
  GatewayModelNotFoundError: "model_not_found",
  GatewayNotFoundError: "model_not_found",
  GatewayInternalServerError: "provider_error",
  GatewayFailedDependencyError: "provider_error",
  GatewayTimeoutError: "timeout",
};

/** Walks wrapped errors (RetryError, causes) to the most specific one. */
function* chain(error: unknown): Generator<unknown> {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    yield current;
    const e = current as { lastError?: unknown; cause?: unknown };
    current = e.lastError ?? e.cause;
  }
}

function fromStatus(status: number, body: string): ProviderErrorCode {
  const text = body.toLowerCase();
  const mentionsTools =
    /\btools?\b|function[ _]?call|tool_choice|tool use/.test(text) &&
    /support|not (?:allowed|available|enabled)|unsupported|invalid/.test(text);
  if (mentionsTools && status >= 400 && status < 500)
    return "tools_unsupported";
  if (
    /context[ _]?(length|window)|maximum context|too many tokens|prompt is too long|reduce the length/.test(
      text,
    )
  )
    return "context_too_long";
  if (status === 401) return "unauthorized";
  if (status === 402) return "quota_exceeded";
  if (status === 429)
    return /quota|billing|credit|insufficient|exceeded your current/.test(text)
      ? "quota_exceeded"
      : "rate_limited";
  if (status === 403)
    return /quota|billing|credit/.test(text) ? "quota_exceeded" : "forbidden";
  if (status === 404) return "model_not_found";
  if (
    status === 400 &&
    /model.{0,40}(not (?:found|exist|available)|does not exist|unknown|invalid model)|no such model|model_not_found|not a valid model/.test(
      text,
    )
  )
    return "model_not_found";
  if (
    status === 400 &&
    /api[ _-]?key|unauthori[sz]ed|authentication/.test(text)
  )
    return "unauthorized";
  if (status === 408 || status === 504) return "timeout";
  if (status >= 500) return "provider_error";
  if (status >= 400) return "invalid_request";
  return "unknown";
}

/**
 * Maps any provider/SDK/network error to a stable code. Response bodies are
 * inspected for classification only and never copied into the result.
 */
export function classify(
  error: unknown,
  providerName: string,
  context: { aborted?: boolean; timedOut?: boolean } = {},
): ProviderFailure {
  let code: ProviderErrorCode = "unknown";
  if (context.timedOut) code = "timeout";
  else if (context.aborted) code = "cancelled";
  else if (error instanceof ProviderFailure) return error;
  else
    for (const e of chain(error)) {
      if (APICallError.isInstance(e)) {
        if (e.statusCode !== undefined) {
          code = fromStatus(e.statusCode, e.responseBody ?? "");
          break;
        }
        continue; // network failure: inspect the cause
      }
      // Gateway and other SDK errors carry a status without being APICallErrors.
      const status = (e as { statusCode?: unknown })?.statusCode;
      if (typeof status === "number" && status >= 400) {
        const body = (e as { responseBody?: unknown }).responseBody;
        code = fromStatus(status, typeof body === "string" ? body : "");
        break;
      }
      if (LoadAPIKeyError.isInstance(e) || LoadSettingError.isInstance(e)) {
        code = "credentials_missing";
        break;
      }
      if (NoSuchModelError.isInstance(e)) {
        code = "model_not_found";
        break;
      }
      const named = e as { name?: string; code?: string; message?: string };
      const gateway = named?.name ? GATEWAY[named.name] : undefined;
      if (gateway) {
        code = gateway;
        break;
      }
      if (named?.name === "TimeoutError") {
        code = "timeout";
        break;
      }
      if (named?.name === "AbortError") {
        code = "cancelled";
        break;
      }
      if (named?.code && NETWORK_CODES.has(named.code)) {
        code = "unreachable";
        break;
      }
      if (
        named?.name === "TypeError" &&
        /fetch failed|network|failed to fetch/i.test(named.message ?? "")
      ) {
        code = "unreachable";
        continue; // a cause may be more specific
      }
      // google-auth-library and AWS credential chains report missing credentials this way.
      if (
        /could not load the default credentials|credential.*(not found|missing|unavailable)|unable to (?:detect|load) .*credentials/i.test(
          named?.message ?? "",
        )
      ) {
        code = "credentials_missing";
        break;
      }
    }
  return new ProviderFailure(code, failureMessage(code, providerName));
}
