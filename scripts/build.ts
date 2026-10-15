import { build } from "esbuild";
import { build as buildWeb } from "vite";
import { resolve } from "node:path";
import { cp, rm, writeFile } from "node:fs/promises";
await buildWeb({ configFile: resolve("apps/web/vite.config.ts") });
await build({
  entryPoints: {
    main: "apps/desktop/main.ts",
    "runtime-worker": "apps/desktop/runtime-worker.ts",
  },
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  outExtension: { ".js": ".cjs" },
  // Playwright launches a separate browser process and ships its own assets,
  // so it is loaded from node_modules at runtime rather than bundled.
  external: ["electron", "playwright-core"],
  sourcemap: true,
});
await writeFile(
  "dist/package.json",
  JSON.stringify(
    {
      name: "socius-desktop",
      version: "0.1.0",
      private: true,
      main: "main.cjs",
      description: "Your local AI ally",
      author: "Socius team",
    },
    null,
    2,
  ),
);
// Packaged apps are built from dist/, so ship the unbundled browser driver with them.
// playwright-core has no dependencies of its own; the browser binary stays external.
await rm("dist/node_modules/playwright-core", { recursive: true, force: true });
await cp("node_modules/playwright-core", "dist/node_modules/playwright-core", {
  recursive: true,
  dereference: true,
});
