import assert from "node:assert/strict";
import { startRuntime, type RuntimeOptions } from "../src/server.js";
import type { ModelRunner } from "../src/model.js";
import type { ProviderConnection } from "@socius/contracts/providers";

export async function paired(
  dataDir: string,
  runner?: ModelRunner,
  extra: Partial<RuntimeOptions> = {},
) {
  const runtime = await startRuntime({
    dataDir,
    env: {},
    ...(runner ? { runner } : {}),
    ...extra,
  });
  const pairing = await fetch(runtime.pairingURL, { redirect: "manual" });
  const cookie = pairing.headers.get("set-cookie")!.split(";")[0]!;
  async function request(
    path: string,
    data?: unknown,
    method = data === undefined ? "GET" : "POST",
    origin = runtime.origin,
  ) {
    return fetch(`${runtime.origin}/api/${path}`, {
      method,
      headers: {
        Cookie: cookie,
        Origin: origin,
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  }
  return { ...runtime, request };
}
/** Adds a local connection and a manually entered default model. */
export async function connectModel(
  r: Awaited<ReturnType<typeof paired>>,
  modelId = "test-model",
) {
  const connection = (await (
    await r.request("providers", {
      provider: "ollama",
      config: { baseURL: "http://127.0.0.1:11434/v1" },
    })
  ).json()) as ProviderConnection;
  const added = await r.request("models", {
    connectionId: connection.id,
    modelId,
  });
  assert.equal(added.status, 201);
  return connection;
}
