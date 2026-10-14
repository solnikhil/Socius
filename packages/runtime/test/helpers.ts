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

/** Real wire Host override: Node's fetch deliberately ignores a custom Host header. */
export async function proxyRequest(
  origin: string,
  path: string,
  remoteOrigin: string,
  data?: unknown,
  headers: Record<string, string> = {},
  method = data === undefined ? "GET" : "POST",
): Promise<Response> {
  const { request } = await import("node:http");
  const { Readable } = await import("node:stream");
  return new Promise((resolve, reject) => {
    const req = request(
      origin + path,
      {
        method,
        headers: {
          Host: new URL(remoteOrigin).host,
          Origin: remoteOrigin,
          ...(data === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
      },
      (res) => {
        const h = new Headers();
        for (let i = 0; i < res.rawHeaders.length; i += 2)
          h.append(res.rawHeaders[i]!, res.rawHeaders[i + 1]!);
        resolve(
          new Response(Readable.toWeb(res) as ReadableStream<Uint8Array>, {
            status: res.statusCode!,
            headers: h,
          }),
        );
      },
    );
    req.on("error", reject);
    req.end(data === undefined ? undefined : JSON.stringify(data));
  });
}
