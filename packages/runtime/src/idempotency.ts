import { createHash } from "node:crypto";
import type { ServerResponse } from "node:http";
import type { Store } from "./store.js";
import { fail, observeJson } from "./http.js";

type Receipt = { hash: string; status: number | null; result: string | null };
const tracked = new WeakMap<ServerResponse, () => void>();
export const assertSession = (res: ServerResponse) => tracked.get(res)?.();
const streams = new WeakMap<ServerResponse, (taskId: string) => void>();
export const acceptStream = (res: ServerResponse, taskId: string) =>
  streams.get(res)?.(taskId);
export const idempotentRoute = (path: string) =>
  [
    "/api/chat",
    "/api/groups/chat",
    "/api/groups/retry",
    "/api/approvals",
    "/api/actions/resolve",
    "/api/tasks/cancel",
  ].includes(path);
/** A reservation is never replayed as an execution, even after a crash. */
export function reserveRequest(
  store: Store,
  deviceId: string,
  key: string,
  path: string,
  input: unknown,
  res: ServerResponse,
  check: () => void,
) {
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(key))
    fail(
      400,
      "Expected an Idempotency-Key (16–128 letters, digits, underscores or hyphens)",
    );
  const hash = createHash("sha256")
    .update(path + "\n" + JSON.stringify(input))
    .digest("hex");
  // Keep receipts for the device lifetime. Expired/revoked sessions cannot retry them.
  const existing = store.db
    .prepare(
      "SELECT hash,status,result FROM remote_requests WHERE device_id=? AND key=?",
    )
    .get(deviceId, key) as Receipt | undefined;
  if (existing) {
    if (existing.hash !== hash)
      fail(409, "Idempotency key was already used for a different request");
    return {
      status: existing.status ?? 409,
      result: existing.result
        ? JSON.parse(existing.result)
        : {
            error:
              "Request accepted but its result is not known. Refresh this chat; do not resend automatically.",
          },
    };
  }
  const count = store.db
    .prepare("SELECT count(*) AS n FROM remote_requests WHERE device_id=?")
    .get(deviceId)!.n as number;
  if (count >= 20000)
    fail(
      429,
      "Device request limit reached. Pair a new browser session on your laptop.",
    );
  store.db
    .prepare("INSERT INTO remote_requests VALUES(?,?,?,NULL,NULL,?)")
    .run(deviceId, key, hash, new Date().toISOString());
  tracked.set(res, check);
  const finish = (status: number, result: unknown) =>
    store.db
      .prepare(
        "UPDATE remote_requests SET status=?,result=? WHERE device_id=? AND key=? AND status IS NULL",
      )
      .run(status, JSON.stringify(result), deviceId, key);
  observeJson(res, finish);
  streams.set(res, (taskId) => finish(200, { taskId, replayed: true }));
  return null;
}
