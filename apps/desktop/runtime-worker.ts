import { randomUUID } from "node:crypto";
import {
  startRuntime,
  type SecretBox,
} from "../../packages/runtime/src/server.js";
type Port = {
  postMessage: (message: unknown) => void;
  on: (event: string, callback: (event: { data: any }) => void) => void;
};
const parent = (process as typeof process & { parentPort: Port }).parentPort;
const requests = new Map<
  string,
  {
    resolve: (value: string) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
function secret(operation: string, value: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timer = setTimeout(() => {
      requests.delete(id);
      reject(new Error("Credential storage timed out"));
    }, 10000);
    requests.set(id, { resolve, reject, timer });
    parent.postMessage({ type: "secret", id, operation, value });
  });
}
let started = false;
parent.on("message", async ({ data }) => {
  if (data.type === "secret-result") {
    const request = requests.get(data.id);
    if (!request) return;
    clearTimeout(request.timer);
    requests.delete(data.id);
    if (data.error) request.reject(new Error(data.error));
    else request.resolve(data.value);
    return;
  }
  if (data.type === "start" && !started) {
    started = true;
    try {
      const box: SecretBox = {
        encrypt: (v) => secret("encrypt", v),
        decrypt: (v) => secret("decrypt", v),
      };
      const runtime = await startRuntime({
        dataDir: data.dataDir,
        webDir: data.webDir,
        // Sign-in pages open in the system browser, never inside the app or chat.
        openExternal: (url) => parent.postMessage({ type: "open-external", url }),
        ...(data.secretStorage ? { secretBox: box } : {}),
      });
      parent.postMessage({
        type: "ready",
        url: runtime.pairingURL,
        origin: runtime.origin,
      });
    } catch {
      parent.postMessage({ type: "startup-error" });
    }
  }
});
