import { resolve } from "node:path";
import { startRuntime } from "../../packages/runtime/src/server.js";
const runtime = await startRuntime({
  dataDir: resolve(process.env.SOCIUS_DATA_DIR ?? ".socius"),
  webDir: resolve("dist/web"),
  port: Number(process.env.SOCIUS_PORT ?? 3030),
});
console.log(`Open this one-time local pairing link:\n${runtime.pairingURL}`);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void runtime.close().then(() => process.exit(0));
  });
