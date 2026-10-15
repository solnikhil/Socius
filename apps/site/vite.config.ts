import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

// The product site borrows the app's shadcn primitives, faces and provider marks
// through the same "@" alias, so both always show the same Socius.
export default defineConfig({
  root: resolve("apps/site"),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": resolve("apps/web/src") } },
  build: { outDir: resolve("dist/site"), emptyOutDir: true },
});
