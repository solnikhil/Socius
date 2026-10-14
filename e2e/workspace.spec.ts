import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
// Both tests share one fixture runtime and its one-time pairing, so they run in order.
test.describe.configure({ mode: "serial" });
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
  // Each bot can take its own model from Settings, or follow the default.
  const botModel = settings.getByLabel("Model for Socius");
  await expect(botModel).toHaveValue("");
  await botModel.selectOption({ label: "fixture-model" });
  await expect(botModel).toHaveValue(/fixture-model/);
  await botModel.selectOption({ value: "" });
  await expect(botModel).toHaveValue("");
  await page.emulateMedia({ colorScheme: "dark" });
  await settings.getByRole("tab", { name: "Providers" }).click();
  await page.screenshot({
    path: "test-results/socius-settings-providers-dark.png",
    animations: "disabled",
  });
  await settings.getByRole("tab", { name: "Models" }).click();
  await page.screenshot({
    path: "test-results/socius-settings-dark.png",
    animations: "disabled",
  });
  await page.emulateMedia({ colorScheme: "light" });
  await page.keyboard.press("Escape");
  await expect(settings).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Model: fixture-model" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Socius details" }).click();
  const details = page.locator(".bot-details");
  await expect(
    details.getByRole("radio", { name: "Workspace default" }),
  ).toBeChecked();
  await details.getByRole("radio", { name: "fixture-model" }).click();
  await expect(
    details.getByRole("radio", { name: "fixture-model" }),
  ).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);
  await page.getByRole("button", { name: "Create" }).first().click();
  // The + opens the same palette as New chat; there is no separate menu.
  await expect(page.getByRole("menu", { name: "Create" })).toHaveCount(0);
  await expect(
    page.getByRole("option", { name: /Create category/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Boards", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("option", { name: /Create new bot/ }).click();
  // Templates fill the form; every field stays editable.
  await page.getByRole("tab", { name: "Marketing" }).click();
  await page.getByRole("button", { name: /Copy Humanizer/ }).click();
  await expect(page.getByLabel("Role", { exact: true })).toHaveValue(
    "Rewrites drafts to sound natural",
  );
  await expect(page.getByLabel("Instructions")).toHaveValue(
    /sounds like a person wrote it/,
  );
  await page.screenshot({
    path: "test-results/socius-bot-templates.png",
    animations: "disabled",
  });
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
  await expect(page.getByRole("tab", { name: "Skills" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Skills" })).toHaveCount(0);
  // Only installable connectors are listed; planned rows are gone.
  await expect(
    page.getByRole("heading", { name: "Razorpay", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/socius-connect-apps.png",
    animations: "disabled",
  });
  await page.getByRole("tab", { name: "Connectors", exact: true }).click();
  const notionRow = page.locator(".app-row").filter({
    has: page.getByRole("heading", { name: "Notion", exact: true }),
  });
  await expect(notionRow.locator(".app-icon img")).toBeVisible();
  // Every reviewed connector shows its logo, never a letter fallback.
  await expect(page.locator(".app-row .monogram")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Payments", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "IRCTC", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /: planned$/ })).toHaveCount(0);
  await page.getByRole("tab", { name: "Bots", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Researcher", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.emulateMedia({ colorScheme: "light" });
  await page.getByRole("button", { name: "Socius", exact: true }).click();
  const sidebar = page.getByRole("complementary", { name: "Bots" });
  await expect(
    sidebar.getByRole("button", { name: "Memory", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Account and settings" }).click();
  await page.getByRole("menuitem", { name: "Memory" }).click();
  const memory = page.getByRole("dialog", { name: "Memory" });
  await expect(memory).toBeVisible();
  await expect(sidebar).toBeAttached();
  await memory.getByRole("button", { name: "Add memory" }).click();
  await memory
    .getByRole("textbox", { name: "What should Socius remember?" })
    .fill("I prefer concise summaries.");
  await memory
    .getByRole("button", { name: "Save memory", exact: true })
    .click();
  await expect(
    memory.getByText("I prefer concise summaries.", { exact: true }),
  ).toBeVisible();
  await memory.getByRole("button", { name: "Edit", exact: true }).click();
  await memory
    .getByRole("textbox", { name: "What should Socius remember?" })
    .fill("I prefer detailed summaries.");
  await memory
    .getByRole("button", { name: "Save memory", exact: true })
    .click();
  await expect(
    memory.getByText("I prefer detailed summaries.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Account and settings" }).click();
  await page.getByRole("menuitem", { name: "Memory" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Memory" })
      .getByText("I prefer detailed summaries.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/socius-memory.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Memory" })).not.toBeVisible();
  await page
    .getByRole("button", { name: "Create", exact: true })
    .first()
    .click();
  await page.getByRole("option", { name: /Create group chat/ }).click();
  await expect(
    page.getByRole("heading", { name: "New group chat", exact: true }),
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
  // Reacting to a bot's reply sticks; tapping the badge removes it.
  const plannerReply = page
    .locator(".message")
    .filter({ hasText: "Planner here. 1. Research" });
  const reactTo = plannerReply.getByRole("button", {
    name: "React",
    exact: true,
  });
  await plannerReply.hover();
  await reactTo.click();
  await page.getByRole("menuitemradio", { name: /React ❤️/ }).click();
  await expect(page.getByRole("menu", { name: "Reactions" })).toHaveCount(0);
  await expect(
    plannerReply.getByRole("button", { name: /Remove your ❤️ reaction/ }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: /Launch crew Socius, Planner/ })
    .click();
  await expect(
    plannerReply.getByRole("button", { name: /Remove your ❤️ reaction/ }),
  ).toBeVisible();
  // The picker is keyboard friendly: focus starts on the current reaction,
  // Escape closes it, and number keys pick.
  await plannerReply.hover();
  await reactTo.click();
  await expect(
    page.getByRole("menuitemradio", { name: /React ❤️/ }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Reactions" })).toHaveCount(0);
  await expect(reactTo).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("1");
  await expect(
    plannerReply.getByRole("button", { name: /Remove your 👍 reaction/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/socius-group-chat-light.png",
    animations: "disabled",
  });
  await plannerReply
    .getByRole("button", { name: /Remove your 👍 reaction/ })
    .click();
  await expect(plannerReply.locator(".reaction-badge")).toHaveCount(0);
  await expect(page.getByRole("menu", { name: "Reactions" })).toHaveCount(0);
  await page.reload();
  await page
    .getByRole("button", { name: /Launch crew Socius, Planner/ })
    .click();
  await expect(page.getByText("Planner here. 1. Research")).toBeVisible();
  await expect(plannerReply.locator(".reaction-badge")).toHaveCount(0);
  // A failed group reply can be retried without resending the message.
  await page
    .getByRole("textbox", { name: "Message Launch crew" })
    .fill("flaky follow-up");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByRole("button", { name: "Retry reply" }).click();
  await expect(page.getByText("Thanks, Planner.")).toHaveCount(2);
  await expect(page.getByText("flaky follow-up")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Retry reply" })).toHaveCount(
    0,
  );
  await page.emulateMedia({ colorScheme: "dark" });
  await page.getByRole("button", { name: "Launch crew details" }).click();
  await expect(page.getByText("3 bots · Socius coordinates")).toBeVisible();
  await page.screenshot({
    path: "test-results/socius-group-chat-dark.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Edit members" }).click();
  await page.getByRole("checkbox", { name: /College assistant/ }).click();
  await expect(page.getByLabel("Member requests per message")).toHaveValue("6");
  await page.getByLabel("Member requests per message").fill("3");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("button", { name: /Launch crew Socius, Planner$/ }),
  ).toBeVisible();
  // Categories only organise the sidebar; filing a bot leaves its groups alone.
  // Everything is created from the top + menu; section headings have no +.
  await expect(
    page.getByRole("button", { name: "New group chat", exact: true }),
  ).toHaveCount(0);
  // Bots outside a category are listed under Unassigned; there is no bot search.
  const unassigned = page.getByRole("region", { name: "Unassigned" });
  await expect(
    unassigned.getByRole("button", { name: /Planner/ }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("Search bots")).toHaveCount(0);
  // Categories are created only from the + palette.
  await expect(
    unassigned.getByRole("button", { name: "New category" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Create", exact: true })
    .first()
    .click();
  await page.getByRole("option", { name: /Create category/ }).click();
  await page.getByLabel("Name", { exact: true }).fill("Work");
  await page.getByRole("checkbox", { name: /Planner/ }).click();
  await page.getByRole("button", { name: "Create category" }).click();
  // A category is a sidebar section like Unassigned.
  const workCategory = page.getByRole("region", { name: "Work", exact: true });
  await expect(unassigned.getByRole("button", { name: /Planner/ })).toHaveCount(
    0,
  );
  await expect(
    workCategory.getByRole("button", { name: /Planner/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Launch crew Socius, Planner$/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/socius-categories-dark.png",
    animations: "disabled",
  });
  await workCategory
    .getByRole("button", { name: /Planner/ })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to" }).click();
  await page.getByRole("menuitem", { name: "Unassigned" }).click();
  await expect(workCategory.getByText("Right-click a bot")).toBeVisible();
  await workCategory
    .getByRole("button", { name: "Work", expanded: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete category" }).click();
  await expect(workCategory).toBeHidden();
  await expect(
    page.getByRole("button", { name: /Planner Planning specialist/ }),
  ).toBeVisible();
  const college = page.getByRole("button", {
    name: /College assistant College planning/,
  });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await college.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Pin", exact: true }).click();
  await expect(college.getByLabel("Pinned")).toBeVisible();
  await college.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Unpin" }).click();
  await expect(college.getByLabel("Pinned")).toHaveCount(0);
  await college.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Mark as unread" }).click();
  await expect(college.getByLabel("Unread")).toBeVisible();
  await college.click();
  await expect(college.getByLabel("Unread")).toHaveCount(0);
  await college.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename bot" }).click();
  await page
    .getByRole("dialog", { name: "Rename bot" })
    .getByLabel("Name")
    .fill("Course helper");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const helper = page.getByRole("button", {
    name: "Course helper College planning",
  });
  await expect(helper).toBeVisible();
  await helper.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copy conversation ID" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
    /^[0-9a-f-]{36}$/,
  );
  await helper.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Hide from sidebar" }).click();
  const hiddenBots = page.getByRole("region", { name: "Hidden bots" });
  await expect(
    hiddenBots.getByRole("button", { name: "Course helper College planning" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Unassigned" })
      .getByRole("button", { name: "Course helper College planning" }),
  ).toHaveCount(0);
  await hiddenBots
    .getByRole("button", { name: "Course helper College planning" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Show in sidebar" }).click();
  await expect(hiddenBots).toBeHidden();
  await helper.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete for good?" }).click();
  await expect(helper).toHaveCount(0);
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
  await page.getByRole("button", { name: "Account and settings" }).click();
  await page.getByRole("menuitem", { name: "Activity" }).click();
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
  await page.context().storageState({ path: "test-results/paired-state.json" });
  expect(errors).toEqual([]);
});
test("connect Notion, read, approve one exact page and see the result", async ({
  browser,
}) => {
  const context = await browser.newContext({
    storageState: "test-results/paired-state.json",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3137/");
  await expect(
    page.getByRole("button", { name: "Socius", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Connect apps" }).click();

  // Registry discovery is metadata-only; unreviewed servers cannot be installed.
  await page.getByRole("tab", { name: "MCP Registry" }).click();
  await page.getByRole("button", { name: "India", exact: true }).click();
  await expect(page.getByText("io.example/unreviewed")).toBeVisible();
  await expect(
    page
      .locator(".registry-row")
      .filter({ hasText: "io.example/unreviewed" })
      .getByText("Not reviewed", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/socius-registry.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Review" }).click();

  // Install and connect Notion through a browser sign-in outside chat.
  const notion = page.getByRole("dialog", { name: "Notion" });
  await expect(
    notion.getByText("Registry entry reviewed by Socius"),
  ).toBeVisible();
  await notion.getByRole("checkbox").check();
  await notion.getByRole("button", { name: "Install connector" }).click();
  await expect(notion.getByText("Authentication required")).toBeVisible();
  const popup = context.waitForEvent("page");
  await notion.getByRole("button", { name: "Connect Notion" }).click();
  const signIn = await popup;
  await expect(
    signIn.getByText("Connected. You can close this tab"),
  ).toBeVisible();
  await signIn.close();
  await expect(notion.getByText("Ready", { exact: true })).toBeVisible({
    timeout: 10000,
  });
  // Grants are server state: click, then wait for the refreshed snapshot.
  for (const capability of ["documents.read", "documents.write"]) {
    const box = notion.getByRole("checkbox", { name: `Socius ${capability}` });
    await box.click();
    await expect(box).toBeChecked();
  }
  await page.screenshot({
    path: "test-results/socius-notion-setup.png",
    animations: "disabled",
  });
  await notion.getByRole("button", { name: "Close dialog" }).click();
  await page.keyboard.press("Escape");

  // Ask for a source-backed brief; the bot reads and proposes one exact page.
  await page.getByRole("button", { name: "Socius", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Message Socius" })
    .fill("Make a brief from my Q3 planning page");
  await page.getByRole("button", { name: "Send message" }).click();
  // The reply pauses on a review card instead of claiming the change is made.
  await expect(page.getByText("Socius is waiting for you")).toBeVisible();
  const card = page.locator(".action-card");
  await expect(
    card.getByText("Create Notion page “Q3 brief”?", { exact: true }),
  ).toBeVisible();
  // Only what matters: the page body reads as text; IDs and package details stay hidden.
  await expect(card.getByText("Findings", { exact: true })).toBeVisible();
  await expect(
    card.locator(".decision-prose").getByText("## Findings"),
  ).toHaveCount(0);
  await expect(card.getByText(/socius\/notion|documents\.write/)).toHaveCount(
    0,
  );
  // The card never takes focus by itself, so typing cannot answer it.
  await expect(card).not.toBeFocused();
  // Hidden IDs keep a short reference, and the exact arguments are one click away.
  await expect(card.getByText("…111111")).toBeVisible();
  await card.getByText("Exact details").click();
  await expect(
    card.getByText("11111111-1111-1111-1111-111111111111"),
  ).toBeVisible();
  await card.getByText("Exact details").click();
  await page.screenshot({
    path: "test-results/socius-action-review.png",
    animations: "disabled",
  });
  // Once the user focuses the card, "A" answers; the same reply then reports the outcome.
  await card.focus();
  await page.keyboard.press("a");
  await expect(
    page.getByText("Done, the “Q3 brief” page is in Notion."),
  ).toBeVisible();
  await expect(
    card.getByText(/Done · Created Notion page “Q3 brief”/),
  ).toBeVisible();
  await expect(card.getByRole("link", { name: "Open" })).toHaveAttribute(
    "href",
    /notion\.so/,
  );
  await expect(page.getByRole("button", { name: "Stop task" })).toHaveCount(0);
  await page.screenshot({
    path: "test-results/socius-action-done.png",
    animations: "disabled",
  });

  // The activity record shows the executed change.
  await page.getByRole("button", { name: "Account and settings" }).click();
  await page.getByRole("menuitem", { name: "Activity" }).click();
  await expect(
    page.getByText("Created Notion page “Q3 brief”.").first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});
test("Linear grants are scoped to Linear and cleared on disconnect", async ({
  browser,
}) => {
  const context = await browser.newContext({
    storageState: "test-results/paired-state.json",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3137/");
  const openApp = async (name: string) => {
    await page.getByRole("button", { name: "Connect apps" }).click();
    await page.getByRole("textbox", { name: "Search apps" }).fill(name);
    await page
      .locator(".app-row")
      .filter({ has: page.getByRole("heading", { name, exact: true }) })
      .getByRole("button")
      .click();
    return page.getByRole("dialog", { name });
  };
  // Close the detail, then Connect Apps, waiting out each closing animation.
  const closeApp = async (dialog: ReturnType<typeof page.getByRole>) => {
    await dialog.getByRole("button", { name: "Close dialog" }).click();
    await expect(dialog).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("textbox", { name: "Search apps" }),
    ).toHaveCount(0);
  };

  // Install and sign in through the real OAuth/PKCE fixture.
  let linear = await openApp("Linear");
  await linear.getByRole("checkbox").first().check();
  await linear.getByRole("button", { name: "Install connector" }).click();
  await expect(linear.getByText("Authentication required")).toBeVisible();
  const popup = context.waitForEvent("page");
  await linear.getByRole("button", { name: "Connect Linear" }).click();
  const signIn = await popup;
  await expect(
    signIn.getByText("Connected. You can close this tab"),
  ).toBeVisible();
  await signIn.close();
  await expect(linear.getByText("Ready", { exact: true })).toBeVisible({
    timeout: 10000,
  });

  // Socius already holds Notion's legacy global grants; Linear does not borrow them.
  const read = linear.getByRole("checkbox", { name: "Socius documents.read" });
  const write = linear.getByRole("checkbox", {
    name: "Socius documents.write",
  });
  await expect(read).not.toBeChecked();
  await expect(write).not.toBeChecked();
  await read.click();
  await expect(read).toBeChecked();
  await closeApp(linear);

  // The grant is server state and survives reload. Notion's grants are checked below.
  await page.reload();
  linear = await openApp("Linear");
  await expect(
    linear.getByRole("checkbox", { name: "Socius documents.read" }),
  ).toBeChecked();
  await expect(
    linear.getByRole("checkbox", { name: "Socius documents.write" }),
  ).not.toBeChecked();
  await closeApp(linear);

  // Disconnect deletes credentials and clears only Linear's grants.
  linear = await openApp("Linear");
  await linear.getByRole("button", { name: "Disconnect" }).click();
  await expect(
    linear.getByText("Disconnected and credentials deleted."),
  ).toBeVisible();
  await expect(
    linear.getByRole("checkbox", { name: "Socius documents.read" }),
  ).toHaveCount(0);
  await closeApp(linear);
  const state = await page.evaluate(async () =>
    (await fetch("/api/state")).json(),
  );
  expect(
    state.connectorGrants.filter(
      (g: { connectorId: string }) => g.connectorId === "socius/linear",
    ),
  ).toEqual([]);
  const socius = state.bots.find((b: { name: string }) => b.name === "Socius");
  expect(socius.grantedCapabilities).toEqual(
    expect.arrayContaining(["documents.read", "documents.write"]),
  );
  expect(errors).toEqual([]);
  await context.close();
});
test("dream over a direct chat, read its evidence, recall it, correct and forget it", async ({
  browser,
}) => {
  const context = await browser.newContext({
    storageState: "test-results/paired-state.json",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3137/");
  // A dedicated bot keeps this direct chat apart from the earlier tests.
  await page
    .getByRole("button", { name: "Create", exact: true })
    .first()
    .click();
  await page.getByRole("option", { name: /Create new bot/ }).click();
  await page.getByLabel("Name", { exact: true }).fill("Tutor");
  await page.getByLabel("Role", { exact: true }).fill("Study planning");
  await page
    .getByLabel("Instructions", { exact: true })
    .fill("Plan study sessions.");
  await page.getByRole("button", { name: "Create bot", exact: true }).click();
  await page.getByRole("button", { name: /Tutor Study planning/ }).click();
  const tutor = page.getByRole("textbox", { name: "Message Tutor" });
  // Waits for this reply to land and the task to finish, so dreaming is not blocked.
  const say = async (text: string, reply: string | RegExp) => {
    const before = await page.getByText(reply).count();
    await tutor.fill(text);
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText(reply)).toHaveCount(before + 1);
    await expect(page.getByRole("button", { name: "Stop task" })).toHaveCount(
      0,
    );
  };
  const memoryAccess = async (button: "Allow memory" | "Revoke access") => {
    await page.getByRole("button", { name: "Tutor details" }).click();
    await page
      .locator(".bot-details")
      .getByRole("button", { name: /Memory/ })
      .click();
    await page
      .getByRole("dialog", { name: "Memory permissions" })
      .getByRole("button", { name: button })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Memory permissions" }),
    ).toHaveCount(0);
  };
  await memoryAccess("Allow memory");
  await say(
    "Remember: I study chemistry on Tuesday evenings.",
    /summary of your supplied document/,
  );

  // Dreaming takes its own model and consent, separate from chat.
  const settings = page.getByRole("dialog", { name: "Settings" });
  const openSettings = async (tab: string) => {
    await page.getByRole("button", { name: "Account and settings" }).click();
    await page.getByRole("menuitem", { name: "Settings" }).click();
    await settings.getByRole("tab", { name: tab }).click();
  };
  await openSettings("Models");
  await settings
    .getByRole("button", { name: "Add models from Ollama" })
    .click();
  await settings.getByLabel("Model ID").fill("dream-model");
  await settings.getByRole("button", { name: "Add model" }).click();
  await settings.getByRole("button", { name: "Models", exact: true }).click();
  await expect(settings.getByLabel("Default model")).toHaveValue(
    /fixture-model/,
  );
  await settings.getByRole("tab", { name: "Dreaming" }).click();
  await expect(settings.getByText("Dreaming is off.")).toBeVisible();
  await expect(
    settings.getByRole("button", { name: "Dream now" }),
  ).toBeDisabled();
  await settings
    .getByLabel("Dreaming model")
    .selectOption({ label: "dream-model · Ollama" });
  await expect(
    settings.getByText(
      "Direct-chat excerpts and private memories go to your configured Ollama endpoint. It is local only if hosted on this computer.",
    ),
  ).toBeVisible();
  await settings.getByLabel("Enable background dreaming").check();
  await settings
    .getByRole("button", { name: "Save dreaming settings" })
    .click();
  await expect(settings.getByText("Dreaming settings saved.")).toBeVisible();
  await page.reload();
  await openSettings("Dreaming");
  await expect(settings.getByLabel("Enable background dreaming")).toBeChecked();
  await expect(settings.getByLabel("Dreaming model")).toHaveValue(
    /dream-model/,
  );
  await settings.getByRole("tab", { name: "Models" }).click();
  await expect(settings.getByLabel("Default model")).toHaveValue(
    /fixture-model/,
  );
  await settings.getByRole("tab", { name: "Dreaming" }).click();

  // Dream now saves a private note whose evidence reads as the original message.
  await settings
    .getByLabel("Bot to dream for")
    .selectOption({ label: "Tutor" });
  await settings.getByRole("button", { name: "Dream now" }).click();
  const completed = settings
    .locator("article")
    .filter({ hasText: "Tutor · completed" });
  await expect(completed).toBeVisible();
  await expect(completed).toContainText("dream-model · 1 sources · 1 saved");
  // Evidence disclosure works from the keyboard.
  await completed.getByText("Source messages").focus();
  await page.keyboard.press("Enter");
  await expect(
    completed.getByText("Remember: I study chemistry on Tuesday evenings."),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/socius-dreaming.png",
    animations: "disabled",
  });
  await page.keyboard.press("Escape");

  const memory = page.getByRole("dialog", { name: "Memory" });
  const openMemory = async () => {
    await page.getByRole("button", { name: "Account and settings" }).click();
    await page.getByRole("menuitem", { name: "Memory" }).click();
    await memory.getByRole("tab", { name: "Tutor" }).click();
  };
  await openMemory();
  const dreamed = memory.locator(".memory-card").filter({
    hasText: "I study chemistry on Tuesday evenings.",
  });
  await expect(dreamed).toContainText("Dreaming ·");
  await dreamed.getByText("Source messages").click();
  await expect(
    dreamed.getByText("Remember: I study chemistry on Tuesday evenings."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(memory).toHaveCount(0);
  // The reload above returned to Socius.
  await page.getByRole("button", { name: /Tutor Study planning/ }).click();

  // Later chats recall the note; a manual correction replaces what is recalled.
  await say(
    "What do you recall about chemistry?",
    "I recall: I study chemistry on Tuesday evenings.",
  );
  await openMemory();
  await memory.getByRole("button", { name: "Edit", exact: true }).click();
  await memory
    .getByRole("textbox", { name: "What should Tutor remember?" })
    .fill("I study chemistry on Thursday evenings.");
  await memory
    .getByRole("button", { name: "Save memory", exact: true })
    .click();
  await expect(
    memory.getByText("I study chemistry on Thursday evenings."),
  ).toBeVisible();
  await expect(memory.getByText(/User editor ·/)).toBeVisible();
  await page.keyboard.press("Escape");
  await say(
    "What do you recall about chemistry?",
    "I recall: I study chemistry on Thursday evenings.",
  );

  // Deleting the note stops recall.
  await openMemory();
  await memory.getByRole("button", { name: "Edit", exact: true }).click();
  await memory.getByRole("button", { name: "Delete memory" }).click();
  await expect(
    memory.getByText("I study chemistry on Thursday evenings."),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await say(
    "What do you recall about chemistry?",
    "I have nothing recalled for that.",
  );

  // Stop ends a running dream without saving.
  await say("Slow dream: take your time.", /summary of your supplied document/);
  await openSettings("Dreaming");
  await settings
    .getByLabel("Bot to dream for")
    .selectOption({ label: "Tutor" });
  await settings.getByRole("button", { name: "Dream now" }).click();
  await settings.getByRole("button", { name: "Stop dreaming" }).click();
  await expect(
    settings.locator("article").filter({ hasText: "Tutor · cancelled" }),
  ).toBeVisible();
  await expect(
    settings.getByRole("button", { name: "Stop dreaming" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Revoked memory access blocks dreaming for that bot.
  await memoryAccess("Revoke access");
  await openSettings("Dreaming");
  await settings
    .getByLabel("Bot to dream for")
    .selectOption({ label: "Tutor" });
  await settings.getByRole("button", { name: "Dream now" }).click();
  await expect(
    settings.getByText(
      "This bot needs memory read and write access for dreaming",
    ),
  ).toBeVisible();

  // Removing the dreaming model leaves dreaming visibly unavailable, with no fallback.
  await settings.getByRole("tab", { name: "Models" }).click();
  await settings.getByRole("button", { name: "Remove dream-model" }).click();
  await expect(
    settings.getByRole("button", { name: "Remove dream-model" }),
  ).toHaveCount(0);
  await settings.getByRole("tab", { name: "Dreaming" }).click();
  await expect(
    settings.getByText(
      "The saved dreaming model is unavailable. Choose another and save.",
    ),
  ).toBeVisible();
  await expect(
    settings.getByRole("option", {
      name: "Selected model unavailable — choose another",
    }),
  ).toBeAttached();
  await expect(
    settings.getByRole("button", { name: "Dream now" }),
  ).toBeDisabled();
  await page.screenshot({
    path: "test-results/socius-dreaming-unavailable.png",
    animations: "disabled",
  });
  expect(errors).toEqual([]);
  await context.close();
});
