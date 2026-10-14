import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    ...(process.env.CI ? {} : { channel: "chrome" }),
    headless: true,
    viewport: { width: 1320, height: 880 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node --import tsx e2e/server.ts",
    url: "http://127.0.0.1:3137",
    reuseExistingServer: false,
    timeout: 15000,
  },
});
