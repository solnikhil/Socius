import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("configure a model, create bots manually and through Socius, install skills and edit memory", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(await readFile("test-results/pairing-url", "utf8"));
  await expect(
    page.getByRole("heading", { name: "What shall we work on?" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/socius-chat.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Model ID").fill("fixture-model");
  await page.getByRole("button", { name: "Save connection" }).click();
  await expect(page.getByRole("status")).toHaveText("Connection saved");
  await page.getByRole("button", { name: "New bot", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("College assistant");
  await page.getByLabel("Role", { exact: true }).fill("College planning");
  await page
    .getByLabel("Instructions", { exact: true })
    .fill("Help me organise coursework from supplied documents.");
  await page.getByRole("button", { name: "Create bot", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: /Socius Personal coordinator/ })
    .click();
  await page
    .getByRole("textbox", { name: "Message Socius" })
    .fill("Create a planning bot");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Review a new bot")).toBeVisible();
  await page.getByRole("button", { name: "Create bot", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Planner Planning specialist/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Marketplace", exact: true }).click();
  await page.screenshot({
    path: "test-results/socius-marketplace.png",
    fullPage: true,
  });
  const card = page.locator(".catalog-card").filter({
    has: page.getByRole("heading", { name: "Document summary", exact: true }),
  });
  await card.getByRole("button", { name: "Install", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Install skill" })
    .click();
  await expect(card.getByRole("button", { name: "Installed" })).toBeVisible();
  await page.getByRole("button", { name: "Bots", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Researcher", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Memory", exact: true }).click();
  await page.getByRole("button", { name: "Add memory" }).click();
  await page
    .getByRole("dialog")
    .getByRole("textbox")
    .fill("I prefer concise summaries.");
  await page.getByRole("button", { name: "Save memory", exact: true }).click();
  await expect(
    page.getByText("I prefer concise summaries.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("textbox")
    .fill("I prefer detailed summaries.");
  await page.getByRole("button", { name: "Save memory", exact: true }).click();
  await expect(
    page.getByText("I prefer detailed summaries.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Memory", exact: true }).click();
  await expect(
    page.getByText("I prefer detailed summaries.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/socius-memory.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
