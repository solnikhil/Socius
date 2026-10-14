import { test, expect, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startRuntime } from "../packages/runtime/src/server.js";
import type { ModelRunner } from "../packages/runtime/src/model.js";

// Deterministic team model fixture for this spec only. Production never selects it.
// It reads the roster the runtime gives the coordinator and plans by member name.
const teamFixture: ModelRunner = async (request, onText) => {
  const prompt = String(request.messages[0]?.content ?? "");
  let text: string;
  if (request.team?.phase === "plan") {
    const roster = new Map(
      [
        ...(request.briefing ?? "").matchAll(
          /- id ([0-9a-f-]{36}): ([^—\n]+?) —/g,
        ),
      ].map((m) => [m[2]!.trim(), m[1]!]),
    );
    const sources = [
      ...(request.briefing ?? "").matchAll(
        /- id ([0-9a-f-]{36}): [^\n]+\.txt/g,
      ),
    ].map((m) => m[1]!);
    request.proposePlan!({
      summary: "Research the notes, draft a brief, then review it.",
      tasks: [
        {
          key: "research",
          title: "Extract findings",
          instructions: "List the findings in the shared notes.",
          assigneeId: roster.get("Researcher"),
          dependsOn: [],
          sourceIds: sources,
        },
        {
          key: "draft",
          title: "Draft the brief",
          instructions: "Write a short brief from the findings.",
          assigneeId: roster.get("Writer"),
          dependsOn: ["research"],
          sourceIds: [],
        },
        {
          key: "review",
          title: "Review claims",
          instructions: "Flag unsupported claims.",
          assigneeId: roster.get("Reviewer"),
          dependsOn: ["draft"],
          sourceIds: sources,
        },
      ],
    });
    text = "Plan recorded.";
  } else if (request.team?.phase === "task") {
    text =
      request.bot.name === "Researcher"
        ? "Finding: local-first assistants are growing (market-notes.txt)."
        : request.bot.name === "Writer"
          ? "Draft: Local-first assistants are growing, and 80% of users prefer them."
          : "Review: the 80% figure is unsupported by market-notes.txt.";
  } else if (request.team?.phase === "synthesize") {
    const from = [...prompt.matchAll(/from="([^"]+)"/g)].map((m) => m[1]);
    text = `**Final brief.** Local-first assistants are growing (market-notes.txt). The unsupported 80% figure was removed after review. Contributors: ${from.join(", ")}.`;
  } else text = "Hello.";
  onText(text);
  return text;
};

async function api(page: Page, path: string, data: unknown) {
  return page.evaluate(
    async ([path, data]) => {
      const r = await fetch(`/api/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return r.json();
    },
    [path, data] as const,
  );
}

test("a four-member research board plans, delegates and returns one reviewed brief that survives reload", async ({
  page,
}) => {
  const dir = await mkdtemp(join(tmpdir(), "socius-e2e-boards-"));
  const runtime = await startRuntime({
    dataDir: dir,
    webDir: resolve("dist/web"),
    runner: teamFixture,
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(runtime.pairingURL);
    await expect(
      page.getByRole("heading", { name: "What shall we work on?" }),
    ).toBeVisible();
    await api(page, "settings", {
      provider: "ollama",
      model: "fixture-model",
      baseURL: "http://127.0.0.1:11434/v1",
    });
    for (const [name, role] of [
      ["Researcher", "Finds evidence in sources"],
      ["Writer", "Writes clear briefs"],
      ["Reviewer", "Checks claims against sources"],
    ] as const)
      await api(page, "bots", {
        name,
        role,
        instructions: `Work as the ${role.toLowerCase()}.`,
      });
    await page.reload();

    await page.getByRole("button", { name: "New board", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name", { exact: true }).fill("Market research");
    await dialog
      .getByLabel("Objective", { exact: true })
      .fill("A short, source-backed brief on local-first assistants.");
    for (const name of ["Researcher", "Writer", "Reviewer"])
      await dialog.getByRole("checkbox", { name: new RegExp(name) }).check();
    await expect(dialog.getByText("Members · 4 selected")).toBeVisible();
    await page.screenshot({
      path: "test-results/socius-board-create.png",
      animations: "disabled",
    });
    await dialog.getByRole("button", { name: "Create board" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();

    await page.getByRole("tab", { name: /Sources/ }).click();
    await page.getByLabel("Name", { exact: true }).fill("market-notes.txt");
    await page
      .getByLabel("Text", { exact: true })
      .fill("Local-first assistants are growing among privacy-minded users.");
    await page.getByRole("button", { name: "Share source" }).click();
    await expect(page.getByText("market-notes.txt")).toBeVisible();

    // A new bot starts under Unassigned, then joins a board from its own menu.
    const sidebar = page.getByRole("complementary", { name: "Bots" });
    const unassigned = sidebar.getByRole("region", { name: "Unassigned" });
    const boardMembers = sidebar.getByRole("group", {
      name: "Market research members",
    });
    await expect(boardMembers.getByRole("button")).toHaveCount(3);
    await api(page, "bots", {
      name: "Editor",
      role: "Tightens wording",
      instructions: "Edit for clarity.",
    });
    await page.reload();
    const editor = unassigned.getByRole("button", { name: /Editor/ });
    await expect(editor).toBeVisible();
    await editor.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Add to board" }).click();
    await page.screenshot({
      path: "test-results/socius-bot-menu.png",
      animations: "disabled",
    });
    await page.getByRole("menuitem", { name: "Market research" }).click();
    await expect(
      boardMembers.getByRole("button", { name: /Editor/ }),
    ).toBeVisible();
    await expect(
      unassigned.getByRole("button", { name: /Editor/ }),
    ).toHaveCount(0);

    // A bot can also be created from inside a board, straight onto it.
    const boardButton = sidebar.getByRole("button", {
      name: /^Market research/,
    });
    await boardButton.click({ button: "right" });
    await page.screenshot({
      path: "test-results/socius-board-menu.png",
      animations: "disabled",
    });
    await page.getByRole("menuitem", { name: "New bot on this board" }).click();
    const create = page.getByRole("dialog");
    await expect(
      create.getByRole("heading", { name: "New bot for Market research" }),
    ).toBeVisible();
    await create.getByLabel("Name", { exact: true }).fill("Fact checker");
    await create.getByLabel("Role", { exact: true }).fill("Verifies numbers");
    await create
      .getByLabel("Instructions", { exact: true })
      .fill("Check every figure against the sources.");
    await create
      .getByLabel("Role on Market research")
      .fill("Checks every figure");
    await create.getByRole("button", { name: "Create bot" }).click();
    await expect(
      boardMembers.getByRole("button", { name: /Fact checker/ }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/socius-sidebar-groups.png",
      animations: "disabled",
    });
    await boardButton.click({ button: "right" });
    await page.getByRole("menuitem", { name: "How this board works" }).click();
    await expect(page.locator(".roster li")).toHaveCount(6);
    await page.screenshot({
      path: "test-results/socius-board-team.png",
      animations: "disabled",
    });

    await page.getByRole("tab", { name: /Thread/ }).click();
    await page
      .getByRole("textbox", { name: "Message the team" })
      .fill("Write the brief.");
    await page.getByRole("button", { name: "Send to team" }).click();
    // The plan waits in the chat; a reply steers it, then Run plan starts it.
    await expect(page.getByRole("button", { name: "Run plan" })).toBeVisible();
    await expect(page.getByText(/Reply to change this plan/)).toBeVisible();
    await page
      .getByRole("textbox", { name: "Message the team" })
      .fill("Keep the brief to two sentences.");
    await page.getByRole("button", { name: "Send to team" }).click();
    await expect(
      page.getByText("Keep the brief to two sentences.", { exact: true }),
    ).toBeVisible();
    // Wait for the revised plan, not the stale button from the first one.
    await expect(page.getByText(/Reply to change this plan/)).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Run plan" })).toBeVisible();
    await page.screenshot({
      path: "test-results/socius-board-plan-review.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Run plan" }).click();
    await expect(page.getByText("Final brief.")).toBeVisible();
    await expect(page.getByRole("status").first()).toHaveText(/Completed/);
    await expect(
      page.getByText(/Contributors: Researcher, Writer, Reviewer/),
    ).toBeVisible();
    await expect(page.getByText(/80% figure is unsupported/)).toBeVisible();
    await page.screenshot({
      path: "test-results/socius-board-thread.png",
      fullPage: true,
      animations: "disabled",
    });

    await page.getByRole("tab", { name: /Tasks/ }).click();
    const done = page.getByRole("region", { name: "Done" });
    await expect(done.locator(".task-card")).toHaveCount(3);
    await page.screenshot({
      path: "test-results/socius-board-tasks.png",
      animations: "disabled",
    });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({
      path: "test-results/socius-board-tasks-dark.png",
      animations: "disabled",
    });
    await page.emulateMedia({ colorScheme: "light" });

    await page.reload();
    await page.getByRole("button", { name: /^Market research/ }).click();
    await expect(page.getByText("Final brief.")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Hide sidebar" }).first().click();
    await expect(page.getByText("Final brief.")).toBeVisible();
    await page.screenshot({
      path: "test-results/socius-board-narrow.png",
      animations: "disabled",
    });
    expect(errors).toEqual([]);
  } finally {
    await runtime.close();
    await rm(dir, { recursive: true, force: true });
  }
});
