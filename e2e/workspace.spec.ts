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
  await page.getByRole("button", { name: "Account and settings" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible();
  // Settings float over the workspace; the sidebar stays rendered behind them.
  await expect(
    page.getByRole("complementary", { name: "Bots" }),
  ).toBeAttached();
  await settings.getByRole("tab", { name: "Providers" }).click();
  await settings.getByRole("button", { name: "Add Ollama" }).click();
  await settings.getByRole("button", { name: "Save connection" }).click();
  await expect(
    settings.getByRole("heading", { name: "Add models from Ollama" }),
  ).toBeVisible();
  await settings.getByLabel("Model ID").fill("fixture-model");
  await settings.getByRole("button", { name: "Add model" }).click();
  await settings.getByRole("button", { name: "Models", exact: true }).click();
  await expect(settings.getByLabel("Default model")).toHaveValue(
    /fixture-model/,
  );
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({
    path: "test-results/socius-settings-dark.png",
    animations: "disabled",
  });
  await page.emulateMedia({ colorScheme: "light" });
  await page.keyboard.press("Escape");
  await expect(settings).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Model: fixture-model" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New bot", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("College assistant");
  await page.getByLabel("Role", { exact: true }).fill("College planning");
  await page
    .getByLabel("Instructions", { exact: true })
    .fill("Help me organise coursework from supplied documents.");
  await page.getByRole("button", { name: "Create bot", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Socius", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Message Socius" })
    .fill("Create a planning bot");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Review a new bot")).toBeVisible();
  await page.getByRole("button", { name: "Create bot", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Planner Planning specialist/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/socius-chat-light.png",
    animations: "disabled",
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({
    path: "test-results/socius-chat-dark.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "New chat" }).click();
  await expect(
    page.getByRole("option", { name: /Create new bot/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/socius-new-chat.png",
    animations: "disabled",
  });
  await page
    .getByRole("combobox", { name: "Start a chat with" })
    .fill("planner");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("textbox", { name: "Message Planner" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Connect apps" }).click();
  const card = page
    .locator(".app-row")
    .filter({
      has: page.getByRole("heading", {
        name: "Document summary",
        exact: true,
      }),
    })
    .first();
  await page.screenshot({
    path: "test-results/socius-connect-apps.png",
    animations: "disabled",
  });
  await card.getByRole("button", { name: "Add", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Install skill" })
    .click();
  await expect(card.getByRole("button", { name: "Added" })).toBeVisible();
  await page.getByRole("tab", { name: "Bots", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Researcher", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.emulateMedia({ colorScheme: "light" });
  await page.getByRole("button", { name: "Socius", exact: true }).click();
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
