import { connectionState } from "./connection.js";
/** An API failure. `code` is set for classified provider errors. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  if (method !== "GET" && !navigator.onLine)
    throw new Error("Offline. Reconnect before taking this action.");
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      method,
      headers:
        body === undefined
          ? {}
          : {
              "Content-Type": "application/json",
              "Idempotency-Key": requestKey(path, body),
            },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (e) {
    connectionState(
      navigator.onLine
        ? "Cannot reach your laptop. It may be asleep, Socius may be stopped, or Tailscale may be disconnected."
        : "Offline. Actions are not queued.",
    );
    throw e;
  }
  if (response.status !== 409) requestKnown(path, body);
  if (response.status === 401)
    connectionState(
      "Session expired or revoked. Pair this browser again from your laptop.",
    );
  else if (response.ok) connectionState("");
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      data.error ?? "Request failed",
      response.status,
      typeof data.code === "string" ? data.code : undefined,
    );
  return data as T;
}

// Keep an uncertain mutation's key in memory until an HTTP outcome is known.
// No retries are scheduled and no request content is persisted in browser storage.
const uncertain = new Map<string, string>();
export function requestKey(path: string, input: unknown) {
  const id = path + "\n" + JSON.stringify(input);
  let key = uncertain.get(id);
  if (!key) {
    if (uncertain.size >= 32)
      throw new Error(
        "Too many uncertain requests. Reconnect and inspect the workspace first.",
      );
    key = crypto.randomUUID();
    uncertain.set(id, key);
  }
  return key;
}
export function requestKnown(path: string, input: unknown) {
  uncertain.delete(path + "\n" + JSON.stringify(input));
}
