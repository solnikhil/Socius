import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { BrowserContext } from "playwright-core";
import { startRuntime } from "../packages/runtime/src/server.js";
import type { Snapshot } from "@socius/contracts/app";

test("browser preview sits beside chat and native window minimizes, restores and resumes", async ({
  page,
}) => {
  const dir = await mkdtemp(join(tmpdir(), "socius-preview-e2e-"));
  const site = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      `<html><title>Research notes</title><style>body{font:24px system-ui;background:#faf9f6;color:#25332d;padding:60px}small{color:#6c8272}h1{font-size:52px}article{background:white;padding:32px;border-radius:16px}</style><small>RESEARCH NOTES</small><h1>A clearer view.</h1><article>The browser works here while your conversation stays in view.</article></html>`,
    );
  }).listen(0, "127.0.0.1");
  await new Promise((r) => site.once("listening", r));
  const fixtureUrl = `http://127.0.0.1:${(site.address() as { port: number }).port}`;
  const runtime = await startRuntime({
    dataDir: dir,
    env: {},
    webDir: resolve("dist/web"),
    browser: {
      headless: !!process.env.CI,
      allowHosts: [new URL(fixtureUrl).host],
    },
    runner: async (request, onText) => {
      const open = request.browserTools?.find((t) => t.name === "browserOpen");
      if (!open) throw new Error("Browser permission missing");
      await open.execute({ url: fixtureUrl });
      const answer =
        "The research page is open. Your conversation stays beside its preview.";
      onText(answer);
      return answer;
    },
  });
  try {
    await page.goto(runtime.pairingURL);
    const post = async (path: string, data: unknown) => {
      const response = await page.request.post(
        `${runtime.origin}/api/${path}`,
        {
          headers: { Origin: runtime.origin },
          data,
        },
      );
      expect(response.ok(), await response.text()).toBeTruthy();
      if (path === "chat") return {};
      return response.json();
    };
    const connection = await post("providers", {
      provider: "ollama",
      config: { baseURL: "http://127.0.0.1:11434/v1" },
    });
    await post("models", {
      connectionId: connection.id,
      modelId: "fixture-model",
    });
    const initial = (await (
      await page.request.get(`${runtime.origin}/api/state`)
    ).json()) as Snapshot;
    const bot = initial.bots[0]!;
    await post("browser/grant", { botId: bot.id, granted: true });
    await post("chat", { botId: bot.id, content: `Read ${fixtureUrl}` });
    await page.reload();
    const dock = page.getByRole("complementary", { name: "Browser workspace" });
    const preview = dock.getByAltText("Current browser page preview");
    await expect(preview).toBeVisible();
    await expect
      .poll(() =>
        preview.evaluate((img) => (img as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    const dockBox = (await dock.boundingBox())!;
    const chatBox = (await page.locator(".chat-scroll").boundingBox())!;
    expect(chatBox.x + chatBox.width).toBeLessThanOrEqual(dockBox.x);
    expect(dockBox.y).toBeLessThan(80);
    await page.screenshot({ path: "test-results/browser-right-preview.png" });

    const session = runtime.browser.sessions()[0]!;
    // Inspect the native window only in this controlled fixture. No CDP handle
    // is exposed by the production API or to a model.
    const live = (
      runtime.browser as unknown as {
        live: Map<string, { context: BrowserContext }>;
      }
    ).live.get(session.id)!;
    const cdp = await live.context.newCDPSession(live.context.pages()[0]!);
    const nativeState = async () =>
      (await cdp.send("Browser.getWindowForTarget")).bounds.windowState;
    if (!process.env.CI) await expect.poll(nativeState).toBe("minimized");
    await dock
      .getByRole("button", { name: "Open browser", exact: true })
      .click();
    if (!process.env.CI) await expect.poll(nativeState).toBe("normal");
    await dock.getByRole("button", { name: "Minimize window" }).click();
    if (!process.env.CI) await expect.poll(nativeState).toBe("minimized");
    await dock.getByRole("button", { name: "Take control" }).click();
    await expect(
      dock.getByText("You have control", { exact: true }),
    ).toBeVisible();
    await expect(preview).toHaveCount(0);
    if (!process.env.CI) await expect.poll(nativeState).toBe("normal");
    await dock.getByRole("button", { name: `Resume ${bot.name}` }).click();
    await expect(preview).toBeVisible();
    if (!process.env.CI) await expect.poll(nativeState).toBe("minimized");
    await expect(
      dock.getByRole("button", { name: "Take control" }),
    ).toBeEnabled();
    await cdp.detach();
    await dock
      .getByRole("button", { name: "Collapse browser preview" })
      .click();
    await expect(preview).toHaveCount(0);
    await dock.getByRole("button", { name: "Expand browser preview" }).click();
    await expect(preview).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Hide sidebar" }).click();
    await expect(page.locator(".sidebar")).toBeHidden();
    await expect(dock).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await page.screenshot({ path: "test-results/browser-preview-phone.png" });
  } finally {
    await runtime.close();
    site.closeAllConnections();
    await new Promise<void>((r) => site.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  }
});
