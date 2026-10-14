// Controlled loopback HTTPS proxy, not a real Tailscale or physical-phone test.
import { test, expect, chromium } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:https";
import { request } from "node:http";
import { startRuntime } from "../packages/runtime/src/server.js";

test("phone HTTPS pairing, shared chat, offline recovery, cancellation, exact approval and revocation", async () => {
  test.setTimeout(90000);
  const dir = await mkdtemp(join(tmpdir(), "socius-phone-browser-"));
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      join(dir, "key.pem"),
      "-out",
      join(dir, "cert.pem"),
      "-days",
      "1",
      "-subj",
      "/CN=laptop.tailtest.ts.net",
    ],
    { stdio: "ignore" },
  );
  const runtime = await startRuntime({
    dataDir: dir,
    webDir: resolve("dist/web"),
    env: {},
    runner: async (req, onText) => {
      const text = String(req.messages.at(-1)?.content);
      if (text.includes("slow")) {
        onText("Still working on your phone task");
        await new Promise<void>((r) => {
          if (req.signal.aborted) r();
          else req.signal.addEventListener("abort", () => r(), { once: true });
        });
        return "stopped";
      }
      if (text.includes("approve"))
        req.proposeBot?.({
          name: "Phone planner",
          role: "Planning",
          instructions: "Plan from user context",
        });
      onText("Same workspace reply");
      return "Same workspace reply";
    },
  });
  const proxy = createServer(
    {
      key: readFileSync(join(dir, "key.pem")),
      cert: readFileSync(join(dir, "cert.pem")),
    },
    (req, res) => {
      const upstream = request(
        runtime.origin + (req.url ?? "/"),
        {
          method: req.method,
          headers: {
            ...req.headers,
            "x-forwarded-host": "laptop.tailtest.ts.net",
            "x-forwarded-proto": "https",
            "x-forwarded-for": "100.100.100.1",
          },
        },
        (up) => {
          res.writeHead(up.statusCode!, up.headers);
          up.pipe(res);
        },
      );
      upstream.on("error", () => res.destroy());
      res.on("close", () => upstream.destroy());
      req.pipe(upstream);
    },
  );
  await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", r));
  const port = (proxy.address() as import("node:net").AddressInfo).port;
  const browser = await chromium.launch({
    ...(process.env.CI ? {} : { channel: "chrome" }),
    args: [
      `--host-resolver-rules=MAP laptop.tailtest.ts.net 127.0.0.1:${port}`,
      "--no-proxy-server",
    ],
  });
  const laptop = await browser.newContext(),
    phone = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
  try {
    console.info("Remote fixture: laptop setup");
    const page = await laptop.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => console.error("Laptop UI:", e.message));
    await page.goto(runtime.pairingURL);
    await expect(
      page.getByRole("heading", { name: "What shall we work on?" }),
    ).toBeVisible();
    await page.evaluate(async () => {
      const post = async (path: string, input: unknown) =>
        (
          await fetch(`/api/${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          })
        ).json();
      const c = await post("providers", {
        provider: "ollama",
        config: { baseURL: "http://127.0.0.1:11434/v1" },
      });
      await post("models", { connectionId: c.id, modelId: "phone-fixture" });
    });
    await page.getByRole("button", { name: "Account and settings" }).click();
    await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
    await page.getByRole("tab", { name: "Remote access & devices" }).click();
    await page
      .getByLabel("Tailscale HTTPS origin")
      .fill("https://laptop.tailtest.ts.net");
    await page.getByLabel("Enable private remote access").check();
    await page.getByRole("button", { name: "Save remote settings" }).click();
    await expect(
      page.getByText("Enabled · Local target:", { exact: false }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Pair a phone", exact: true })
      .click();
    await expect(page.getByAltText("Scan to pair your phone")).toBeVisible();
    const link = await page
      .getByRole("link", { name: "Open phone pairing link" })
      .getAttribute("href");
    console.info("Remote fixture: pair phone browser");
    const mobile = await phone.newPage();
    await mobile.goto(link!);
    expect(mobile.url()).not.toContain("#pair");
    await mobile.getByRole("button", { name: "Pair this phone" }).click();
    const input = mobile.getByRole("textbox", { name: "Message Socius" });
    await expect(input).toBeVisible();
    await input.fill("hello phone");
    await mobile.getByRole("button", { name: "Send message" }).click();
    await expect(
      mobile.getByText("Same workspace reply", { exact: true }),
    ).toBeVisible();
    expect(
      runtime.store.all<any>("message").filter((m) => m.role === "user"),
    ).toHaveLength(1);
    console.info("Remote fixture: offline recovery and cancellation");
    await input.fill("slow phone task");
    await mobile.getByRole("button", { name: "Send message" }).click();
    await expect(
      mobile.getByText("Still working on your phone task", { exact: true }),
    ).toBeVisible();
    await phone.setOffline(true);
    await expect(mobile.getByRole("status")).toContainText("Offline");
    await phone.setOffline(false);
    await expect(
      mobile.getByRole("button", { name: "Stop task" }),
    ).toBeVisible();
    await mobile.getByRole("button", { name: "Stop task" }).click();
    await expect
      .poll(
        () =>
          runtime.store.all<any>("task").filter((t) => t.state === "running")
            .length,
      )
      .toBe(0);
    expect(
      runtime.store.all<any>("message").filter((m) => m.role === "user"),
    ).toHaveLength(2);
    await expect(
      mobile.getByRole("button", { name: "Send message" }),
    ).toBeVisible();
    console.info("Remote fixture: exact approval");
    await input.fill("approve a planner");
    await mobile.getByRole("button", { name: "Send message" }).click();
    const approve = mobile
      .locator(".approval-card")
      .getByRole("button", { name: /Yes, go ahead/ })
      .first();
    await expect(approve).toBeVisible();
    await approve.click();
    await expect
      .poll(() =>
        runtime.store.all<any>("bot").some((b) => b.name === "Phone planner"),
      )
      .toBe(true);
    for (const width of [375, 430]) {
      await mobile.setViewportSize({ width, height: 844 });
      expect(
        await mobile.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await mobile.screenshot({ path: "test-results/remote-phone-chat.png" });
    await mobile
      .getByRole("button", { name: "Show sidebar", exact: true })
      .click();
    await mobile
      .getByRole("button", { name: /Phone planner Planning/ })
      .click();
    await expect(
      mobile.getByRole("textbox", {
        name: "Message Phone planner",
        exact: true,
      }),
    ).toBeVisible();
    await mobile
      .getByRole("button", { name: "Show sidebar", exact: true })
      .click();
    await mobile.getByRole("button", { name: "Account and settings" }).click();
    await mobile
      .getByRole("menuitem", { name: "Settings", exact: true })
      .click();
    await expect(
      mobile.getByRole("dialog", { name: "Settings", exact: true }),
    ).toBeVisible();
    await mobile.getByRole("tab", { name: "Remote access & devices" }).click();
    await expect(
      mobile.getByText(
        "Manage other devices and host settings on your laptop.",
      ),
    ).toBeVisible();
    await expect(
      mobile.getByRole("button", { name: "Sign out this phone" }),
    ).toBeVisible();
    await mobile
      .getByRole("button", { name: "Close settings", exact: true })
      .click();
    // Refresh device list without exposing pairing material in screenshots/traces.
    await page.getByRole("tab", { name: "General", exact: true }).click();
    await page.getByRole("tab", { name: "Remote access & devices" }).click();
    await page
      .getByRole("button", { name: "Revoke My phone", exact: true })
      .click();
    await expect(
      mobile.getByRole("heading", { name: "Pair with Socius" }),
    ).toBeVisible();
    expect(
      await mobile.evaluate(async () => (await fetch("/api/state")).status),
    ).toBe(401);
  } finally {
    console.info("Remote fixture: teardown");
    await browser.close();
    proxy.closeAllConnections();
    await new Promise<void>((r) => proxy.close(() => r()));
    await runtime.close();
    await rm(dir, { recursive: true, force: true });
  }
});
