import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
export default defineConfig({
  root: resolve("apps/web"),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": resolve("apps/web/src") } },
  build: { outDir: resolve("dist/web"), emptyOutDir: true },
});
