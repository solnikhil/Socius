import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import type { ProviderErrorCode } from "@socius/contracts/providers";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Stable category for provider failures, for the interface to act on. */
    readonly code?: ProviderErrorCode,
  ) {
    super(message);
  }
}
export const fail = (
  status: number,
  message: string,
  code?: ProviderErrorCode,
): never => {
  throw new HttpError(status, message, code);
};
const bodies = new WeakMap<IncomingMessage, unknown>();
const validators = new WeakMap<IncomingMessage, () => void>();
export function validateBody(req: IncomingMessage, check: () => void) {
  validators.set(req, check);
}
export async function body(
  req: IncomingMessage,
  limit = 1024 * 1024,
): Promise<unknown> {
  validators.get(req)?.();
  if (bodies.has(req)) return bodies.get(req);
  if (!req.headers["content-type"]?.startsWith("application/json"))
    fail(415, "Expected JSON");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) fail(413, "Request too large");
    chunks.push(chunk);
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    return fail(400, "Invalid JSON");
  }
  validators.get(req)?.();
  bodies.set(req, value);
  return value;
}
const jsonObservers = new WeakMap<
  ServerResponse,
  (status: number, value: unknown) => void
>();
export function observeJson(
  res: ServerResponse,
  fn: (status: number, value: unknown) => void,
) {
  jsonObservers.set(res, fn);
}
export function json(res: ServerResponse, status: number, value: unknown) {
  jsonObservers.get(res)?.(status, value);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
export function errorResponse(res: ServerResponse, error: unknown) {
  if (res.headersSent) {
    res.end();
    return;
  }
  if (error instanceof HttpError)
    json(res, error.status, {
      error: error.message,
      ...(error.code ? { code: error.code } : {}),
    });
  else if (error instanceof z.ZodError)
    json(res, 400, { error: "Invalid request fields" });
  else json(res, 500, { error: "Operation failed" });
}
