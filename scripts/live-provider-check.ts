/** Explicit, synthetic live acceptance run. Never selected by the normal test suite. */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { Store } from "../packages/runtime/src/store.js";
import type { Snapshot, Memory } from "@socius/contracts/app";

if (process.env.SOCIUS_LIVE_TEST !== "1" && !process.argv.includes("--live"))
  throw new Error(
    "Live testing is opt-in: set SOCIUS_LIVE_TEST=1. It sends synthetic prompts using your configured model.",
  );
const source =
  process.env.SOCIUS_LIVE_SOURCE_PROFILE ??
  (process.platform === "darwin"
    ? join(homedir(), "Library", "Application Support", "Socius")
    : undefined);
if (!source)
  throw new Error(
    "Set SOCIUS_LIVE_SOURCE_PROFILE to the desktop user-data directory.",
  );
const profile = await mkdtemp(join(tmpdir(), "socius-live-acceptance-"));
const steps: {
  name: string;
  status: "passed" | "failed";
  durationMs: number;
  detail?: string;
}[] = [];
const report: {
  startedAt: string;
  mode: "full" | "tools-only";
  provider?: string;
  model?: string;
  steps: typeof steps;
  scope: string;
  modelTools?: boolean | null;
} = {
  startedAt: new Date().toISOString(),
  mode: process.argv.includes("--tools-only") ? "tools-only" : "full",
  steps,
  scope:
    "Synthetic prompts in an isolated desktop profile. Notion, other account connectors and user conversations are excluded.",
};
let app: ElectronApplication | undefined;
let page: Page;
const pageErrors: string[] = [];
async function launch() {
  app = await electron.launch({
    args: ["."],
    executablePath:
      process.env.SOCIUS_ELECTRON_EXECUTABLE ??
      resolve(
        "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
      ),
    env: { ...process.env, SOCIUS_USER_DATA: profile },
    timeout: 30000,
  });
  page = await app.firstWindow();
  page.on("pageerror", () => pageErrors.push("Renderer error"));
  await page.waitForURL(/127\.0\.0\.1/, { timeout: 30000 });
}
async function request<T>(
  path: string,
  data?: unknown,
  method?: string,
): Promise<T> {
  const result = await page.evaluate(
    async ({ path, data, method }) => {
      const res = await fetch(`/api/${path}`, {
        method: method ?? (data === undefined ? "GET" : "POST"),
        ...(data === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            }),
        signal: AbortSignal.timeout(90000),
      });
      return { status: res.status, text: await res.text() };
    },
    { path, data, method },
  );
  if (result.status >= 400) {
    // API errors are redacted by the runtime; do not dump provider objects or bodies.
    throw new Error(`API ${path.split("?")[0]} returned ${result.status}`);
  }
  if (path === "chat" || path === "groups/chat") {
    const events = result.text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const failure = events.find((event) => event.type === "error");
    if (failure)
      throw new Error(`Model request failed (${failure.code ?? "unknown"})`);
    assert.ok(
      events.some((event) => event.type === "done"),
      "Stream must end with done",
    );
    assert.ok(
      events.some((event) => event.type === "text"),
      "Stream must include text",
    );
    return events as T;
  }
  return JSON.parse(result.text) as T;
}
const state = () => request<Snapshot>("state");
async function step(name: string, work: () => Promise<void>) {
  if (
    process.argv.includes("--tools-only") &&
    [
      "Live streaming through the desktop chat UI",
      "Live text-document summary",
    ].includes(name)
  )
    return;
  const started = Date.now();
  console.log(`Checking: ${name}`);
  try {
    await work();
    steps.push({ name, status: "passed", durationMs: Date.now() - started });
    console.log(`Passed: ${name}`);
  } catch (error) {
    const detail =
      error instanceof assert.AssertionError
        ? error.message.split("\n")[0]!
        : error instanceof Error
          ? error.message
          : "Unexpected test failure";
    steps.push({
      name,
      status: "failed",
      durationMs: Date.now() - started,
      detail: detail.slice(0, 200),
    });
    throw new Error(detail);
  }
}
try {
  await step("Isolated encrypted provider configuration", async () => {
    const original = new DatabaseSync(
      join(source, "workspace", "socius.sqlite"),
      { readOnly: true },
    );
    const isolated = new Store(join(profile, "workspace"));
    try {
      const selected = original
        .prepare(
          "SELECT connection_id,model_id FROM model_selection WHERE scope='default'",
        )
        .get();
      assert.ok(selected, "Configure a default model in Settings first");
      const connection = original
        .prepare("SELECT * FROM provider_connections WHERE id=?")
        .get(selected.connection_id!);
      const model = original
        .prepare(
          "SELECT * FROM provider_models WHERE connection_id=? AND model_id=?",
        )
        .get(selected.connection_id!, selected.model_id!);
      assert.ok(
        connection && model,
        "Default model must have a saved provider connection",
      );
      for (const [table, row] of [
        ["provider_connections", connection],
        ["provider_models", model],
      ] as const) {
        const columns = Object.keys(row);
        isolated.db
          .prepare(
            `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
          )
          .run(...columns.map((column) => row[column]!));
      }
      isolated.db
        .prepare("INSERT INTO model_selection VALUES('default',?,?)")
        .run(selected.connection_id!, selected.model_id!);
      report.provider = String(connection.provider);
      report.model = String(selected.model_id);
      // Only the selected provider's ciphertext/config is copied. No plaintext key,
      // connectors, conversations, private memory or browser session is copied.
    } finally {
      original.close();
      isolated.close();
    }
    await launch();
    assert.equal((await state()).connectorConnections.length, 0);
    if (process.argv.includes("--tools-only")) {
      const s = await state();
      const entry = s.models[0]!;
      const check = await request<{
        ok: boolean;
        tools: boolean | null;
        code?: string;
      }>("models/test", {
        connectionId: entry.connectionId,
        modelId: entry.modelId,
      });
      console.log(
        `Model check: text=${check.ok}, tools=${check.tools}, code=${check.code ?? "none"}`,
      );
    }
  });
  const mainId = (await state()).bots.find(
    (bot) => bot.template.id === "socius/main",
  )!.id;
  await step("Live streaming through the desktop chat UI", async () => {
    await page
      .getByRole("textbox", { name: "Message Socius" })
      .fill(
        "Synthetic acceptance test. Reply with exactly SOCIUS_LIVE_OK. Do not call tools.",
      );
    await page.getByRole("button", { name: "Send message" }).click();
    await page
      .getByText("SOCIUS_LIVE_OK", { exact: true })
      .waitFor({ timeout: 90000 });
    await page
      .getByRole("button", { name: "Send message" })
      .waitFor({ timeout: 90000 });
    const deadline = Date.now() + 90000;
    let s = await state();
    while (
      s.tasks.some((task) => task.state === "running") &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      s = await state();
    }
    assert.equal(s.tasks.at(-1)?.state, "completed", "Live chat must complete");
    assert.equal(pageErrors.length, 0, "No renderer errors");
  });
  await step("Live text-document summary", async () => {
    await request("chat", {
      botId: mainId,
      content:
        "Summarize the attached synthetic document in one sentence; retain the project name and item count.",
      attachment: {
        name: "acceptance.txt",
        text: "Project Juniper has 17 items. Mira owns the review. This is synthetic test data.",
      },
    });
    const messages = await request<{ role: string; content: string }[]>(
      `messages?botId=${mainId}`,
    );
    const answer = messages
      .filter((message) => message.role === "assistant")
      .at(-1)!.content;
    assert.match(answer, /Juniper/i);
    assert.match(answer, /17/);
  });
  let plannerId = "";
  await step("Live bot proposal and exact approval", async () => {
    await request("chat", {
      botId: mainId,
      content:
        "This is a synthetic acceptance test. Create a NEW persistent specialist using createBot, named Acceptance Planner, role Arithmetic checker, instructions: Check supplied arithmetic carefully and reply briefly. Do not substitute an existing bot. Call the tool once and ask me to review it.",
    });
    const proposal = (await state()).approvals.find(
      (approval) => approval.kind === "bot" && approval.state === "pending",
    );
    assert.ok(proposal, "Main bot must create a pending bot proposal");
    await request("approvals", {
      id: proposal.id,
      digest: proposal.digest,
      approve: true,
    });
    const planner = (await state()).bots.find(
      (bot) => bot.name === "Acceptance Planner",
    );
    assert.ok(planner, "Approved specialist must exist");
    assert.deepEqual(
      planner.grantedCapabilities,
      [],
      "New bots inherit no grants",
    );
    plannerId = planner.id;
  });
  await step(
    "Live memory proposal, restart persistence and approval",
    async () => {
      await request("grants", { botId: mainId, memory: true });
      await request("chat", {
        botId: mainId,
        content:
          "Synthetic test preference: I prefer Juniper bullet-point summaries. Save this preference using proposeMemory exactly once; wait for my approval.",
      });
      const pending = (await state()).approvals.find(
        (approval) =>
          approval.kind === "memory" && approval.state === "pending",
      );
      assert.ok(pending, "Memory must await approval");
      assert.equal(
        (await request<Memory[]>(`memory?botId=${mainId}`)).length,
        0,
        "Unapproved memory must not be saved",
      );
      await app!.close();
      app = undefined;
      await launch();
      const restored = (await state()).approvals.find(
        (approval) => approval.id === pending.id,
      );
      assert.equal(
        restored?.state,
        "pending",
        "Pending approval survives restart",
      );
      await request("approvals", {
        id: pending.id,
        digest: pending.digest,
        approve: true,
      });
      const saved = await request<Memory[]>(`memory?botId=${mainId}`);
      assert.equal(saved.length, 1);
      assert.match(saved[0]!.content, /Juniper/i);
      assert.equal(
        (await request<Memory[]>(`memory?botId=${plannerId}`)).length,
        0,
        "Memory stays private to its bot",
      );
    },
  );
  await step("Live specialist contribution in a group", async () => {
    const group = await request<{ id: string }>("groups", {
      name: "Acceptance group",
      memberIds: [plannerId],
      maxAsks: 1,
    });
    await request("groups/chat", {
      groupId: group.id,
      content:
        "@Acceptance Planner check 17 + 25. Socius, ask Acceptance Planner once, then give me its checked result in one sentence.",
    });
    const messages = await request<
      { botId: string; role: string; content: string }[]
    >(`groups/messages?groupId=${group.id}`);
    assert.ok(
      messages.some(
        (message) =>
          message.role === "assistant" &&
          message.botId === plannerId &&
          /42/.test(message.content),
      ),
      "Specialist must contribute the checked answer",
    );
    assert.ok(
      messages.some(
        (message) =>
          message.role === "assistant" &&
          message.botId === mainId &&
          /42/.test(message.content),
      ),
      "Coordinator must incorporate the answer",
    );
    assert.equal(pageErrors.length, 0);
  });
  console.log("Live acceptance passed. No Notion account was used.");
} catch (error) {
  if (app) {
    try {
      report.modelTools = (await state()).models[0]?.tools ?? null;
      console.log(
        `Tool capability after the failed step: ${report.modelTools}`,
      );
    } catch {}
  }
  console.error(
    `Live acceptance stopped: ${error instanceof Error ? error.message : "Unexpected failure"}`,
  );
  process.exitCode = 1;
} finally {
  await app?.close().catch(() => undefined);
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/live-provider.json",
    JSON.stringify(report, null, 2),
  );
  await rm(profile, { recursive: true, force: true });
}
