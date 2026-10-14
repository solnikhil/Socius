// Deterministic model fixture only for end-to-end tests. Production never selects it.
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startRuntime } from "../packages/runtime/src/server.js";
const dir = await mkdtemp(join(tmpdir(), "socius-e2e-"));
const runtime = await startRuntime({
  dataDir: dir,
  webDir: resolve("dist/web"),
  port: 3137,
  runner: async (request, onText) => {
    const content = String(request.messages.at(-1)?.content);
    if (content.toLowerCase().includes("create"))
      request.proposeBot?.({
        name: "Planner",
        role: "Planning specialist",
        instructions: "Make grounded plans from supplied context.",
      });
    const text = content.toLowerCase().includes("create")
      ? "I proposed a Planner bot. Review it below."
      : "Here is the summary of your supplied document: the team is building Socius.";
    onText(text);
    return text;
  },
});
await mkdir("test-results", { recursive: true });
await writeFile("test-results/pairing-url", runtime.pairingURL);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(
    signal,
    () =>
      void runtime
        .close()
        .then(() => rm(dir, { recursive: true, force: true }))
        .then(() => process.exit(0)),
  );
