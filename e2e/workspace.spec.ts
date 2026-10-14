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
  await page.getByRole("button", { name: "Hide sidebar" }).click();
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(
    page
      .locator(".sidebar")
      .getByRole("button", { name: "Create", exact: true })
      .first(),
  ).toBeHidden();
  await page.getByRole("button", { name: "Show sidebar" }).click();
  await expect(
    page
      .locator(".sidebar")
      .getByRole("button", { name: "Create", exact: true })
      .first(),
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
  await page.getByRole("button", { name: "Create" }).first().click();
  await page.getByRole("menuitem", { name: "New bot" }).click();
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
  await page.getByRole("button", { name: "Create" }).first().click();
  await page.getByRole("menuitem", { name: "New chat" }).click();
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
  await page
    .getByRole("button", { name: "Create", exact: true })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "New group chat" }).click();
  await expect(
    page.getByRole("heading", { name: "New group chat" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: /Planner/ }).click();
  await page.getByRole("checkbox", { name: /College assistant/ }).click();
  await page.getByLabel("Name", { exact: true }).fill("Launch crew");
  await page.screenshot({
    path: "test-results/socius-new-group.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Start group chat" }).click();
  await expect(
    page.getByRole("heading", { name: "What shall we work on together?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Launch crew Socius, Planner/ }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Message Launch crew" })
    .fill("Plan our launch");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Planner here. 1. Research")).toBeVisible();
  await expect(page.getByText("Thanks, Planner.")).toBeVisible();
  await expect(page.locator(".speaker")).toHaveText(["Planner", "Socius"]);
  await page.screenshot({
    path: "test-results/socius-group-chat-light.png",
    animations: "disabled",
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.getByRole("button", { name: "Launch crew details" }).click();
  await expect(page.getByText("3 bots · Socius coordinates")).toBeVisible();
  await page.screenshot({
    path: "test-results/socius-group-chat-dark.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Edit members" }).click();
  await page.getByRole("checkbox", { name: /College assistant/ }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("button", { name: /Launch crew Socius, Planner$/ }),
  ).toBeVisible();
  // Group messages stay out of each bot's direct chat.
  await page
    .getByRole("button", { name: /Planner Planning specialist/ })
    .click();
  await expect(page.getByText("Planner here. 1. Research")).toBeHidden();
  await page.getByRole("button", { name: /Launch crew/ }).click();
  await page.getByRole("button", { name: "Launch crew details" }).click();
  await page.getByRole("button", { name: "Delete group chat" }).click();
  await page.getByRole("button", { name: "Delete for good?" }).click();
  await expect(
    page.locator(".bot-row", { hasText: "Launch crew" }),
  ).toBeHidden();
  await expect(
    page.getByRole("textbox", { name: "Message Socius" }),
  ).toBeVisible();
  await page.emulateMedia({ colorScheme: "light" });
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Activity", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText("A memory record was saved.").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Account and settings" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(
    page.getByRole("heading", { name: "Activity", level: 4 }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
