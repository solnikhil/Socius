import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("Electron launches its isolated runtime and persists a manually created bot across restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "socius-desktop-"));
  const launch = () =>
    electron.launch({
      ...(process.env.SOCIUS_PACKAGED_EXECUTABLE
        ? { executablePath: process.env.SOCIUS_PACKAGED_EXECUTABLE, args: [] }
        : {
            args: ["."],
            ...(process.env.SOCIUS_ELECTRON_EXECUTABLE
              ? { executablePath: process.env.SOCIUS_ELECTRON_EXECUTABLE }
              : {}),
          }),
      env: { ...process.env, SOCIUS_USER_DATA: dir },
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await expect(
      page.getByRole("heading", { name: "What shall we work on?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Hide sidebar" }).click();
    await expect(page.locator(".sidebar")).toBeHidden();
    const reveal = page.getByRole("button", { name: "Show sidebar" });
    await expect(reveal).toBeVisible();
    const hittable = await reveal.evaluate((el) => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const target = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      );
      return (
        style.getPropertyValue("-webkit-app-region").trim() === "no-drag" &&
        style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
        (target === el || el.contains(target))
      );
    });
    expect(hittable).toBe(true);
    await reveal.click();
    await expect(
      page.getByRole("button", { name: "New bot", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "New bot", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("Desktop planner");
    await page.getByLabel("Role", { exact: true }).fill("Planning");
    await page
      .getByLabel("Instructions", { exact: true })
      .fill("Plan from the supplied context.");
    await page.getByRole("button", { name: "Create bot", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /Desktop planner Planning/ }),
    ).toBeVisible();
    await page.screenshot({ path: "test-results/socius-electron.png" });
    const privilegedGlobals = await page.evaluate(() => ({
      require: typeof (globalThis as any).require,
      process: typeof (globalThis as any).process,
    }));
    expect(privilegedGlobals).toEqual({
      require: "undefined",
      process: "undefined",
    });
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(
      page.getByRole("button", { name: /Desktop planner Planning/ }),
    ).toBeVisible();
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
