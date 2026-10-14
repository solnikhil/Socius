import { build } from "esbuild";
import { build as buildWeb } from "vite";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
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
