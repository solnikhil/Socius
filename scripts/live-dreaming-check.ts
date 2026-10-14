/**
 * Explicit, synthetic live acceptance for background dreaming. Never selected
 * by the normal test suite. Runs in an empty isolated desktop profile with
 * only the default provider connection copied; dreaming is never enabled over
 * the user's real history.
 */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import type {
  DreamingStatus,
  DreamRun,
  Memory,
  Message,
  Snapshot,
} from "@socius/contracts/app";
import { Store } from "../packages/runtime/src/store.js";
import { copySelectedProvider, liveSourceProfile } from "./live-profile.js";

if (process.env.SOCIUS_LIVE_TEST !== "1" && !process.argv.includes("--live"))
  throw new Error(
    "Live testing is opt-in: set SOCIUS_LIVE_TEST=1. It sends synthetic prompts using your configured model.",
  );
const source = liveSourceProfile();
const profile = await mkdtemp(join(tmpdir(), "socius-live-dreaming-"));
const CODENAME = "Cobalt Heron";
const ONE_TIME_CODE = "482913";
const steps: {
  name: string;
  status: "passed" | "failed";
  durationMs: number;
  detail?: string;
}[] = [];
const report: {
  startedAt: string;
  provider?: string;
  model?: string;
  steps: typeof steps;
  scope: string;
  run?: Pick<DreamRun, "state" | "saved" | "skipped" | "errorCode">;
  dreamed?: string[];
} = {
  startedAt: new Date().toISOString(),
  steps,
  scope:
    "Synthetic direct chat in an isolated desktop profile. No user conversations, memory or connectors are copied.",
};
let app: ElectronApplication | undefined;
let page: Page;
const pageErrors: string[] = [];
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
        signal: AbortSignal.timeout(150000),
      });
      return { status: res.status, text: await res.text() };
    },
    { path, data, method },
  );
  // API errors are redacted by the runtime; do not dump provider bodies.
  if (result.status >= 400)
    throw new Error(`API ${path.split("?")[0]} returned ${result.status}`);
  if (path === "chat") {
    const events = result.text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const failure = events.find((event) => event.type === "error");
    if (failure)
      throw new Error(`Model request failed (${failure.code ?? "unknown"})`);
    return events as T;
  }
  return JSON.parse(result.text) as T;
}
const state = () => request<Snapshot>("state");
const dreaming = () => request<DreamingStatus>("dreaming");
async function settle(id: string): Promise<DreamRun> {
  const deadline = Date.now() + 150000;
  for (;;) {
    const run = (await dreaming()).runs.find((r) => r.id === id);
    if (run && run.state !== "running" && run.state !== "committing")
      return run;
    assert.ok(Date.now() < deadline, "Dream must finish within 150 seconds");
    await new Promise((r) => setTimeout(r, 500));
  }
}
/** Observations record a failure without stopping the remaining steps. */
async function step(
  name: string,
  work: () => Promise<void>,
  observation = false,
) {
  const started = Date.now();
  console.log(`Checking: ${name}`);
  try {
    await work();
    steps.push({ name, status: "passed", durationMs: Date.now() - started });
    console.log(`Passed: ${name}`);
  } catch (error) {
    const detail =
      error instanceof Error ? error.message.split("\n")[0]! : "Unexpected";
    steps.push({
      name,
      status: "failed",
      durationMs: Date.now() - started,
      detail: detail.slice(0, 200),
    });
    if (observation) {
      process.exitCode = 1;
      console.log(`Failed observation: ${name}: ${detail}`);
      return;
    }
    throw new Error(detail);
  }
}
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
/**
 * Restarts with this isolated profile's transcript removed, so a later answer
 * can only come from recalled memory, not from the earlier turns in context.
 */
async function withoutTranscript(botId: string) {
  await app!.close();
  app = undefined;
  const store = new Store(join(profile, "workspace"));
  try {
    for (const m of store.all<Message>("message"))
      if (m.botId === botId) store.delete("message", m.id);
  } finally {
    store.close();
  }
  await launch();
}
try {
  let mainId = "";
  let chatSource = "";
  await step("Isolated profile with only the provider copied", async () => {
    Object.assign(report, copySelectedProvider(source, profile));
    await launch();
    const s = await state();
    mainId = s.bots.find((b) => b.template.id === "socius/main")!.id;
    assert.equal(s.dreaming.settings.enabled, false, "Dreaming starts off");
    assert.equal(s.connectorConnections.length, 0);
    assert.equal((await request<Memory[]>(`memory?botId=${mainId}`)).length, 0);
  });
  await step("Synthetic direct chat with memory access", async () => {
    await request("grants", { botId: mainId, memory: true });
    await request("chat", {
      botId: mainId,
      content: `Synthetic acceptance test. My project codename is ${CODENAME} and I prefer status notes on Fridays. My one-time login code is ${ONE_TIME_CODE}; never keep it. Reply in one short sentence.`,
    });
    const messages = await request<Message[]>(`messages?botId=${mainId}`);
    chatSource = messages.find((m) => m.role === "user")!.id;
    assert.equal((await state()).tasks.at(-1)?.state, "completed");
  });
  await step("Separate dreaming model and consent", async () => {
    const s = await state();
    const model = s.models[0]!;
    await request("dreaming/settings", {
      expectedRevision: s.dreaming.settings.revision,
      enabled: true,
      model: { connectionId: model.connectionId, modelId: model.modelId },
      idleMinutes: 60,
      intervalMinutes: 1440,
    });
    const status = await dreaming();
    assert.equal(status.settings.enabled, true);
    assert.equal(status.modelAvailable, true);
  });
  await step("Stop cancels a live dream without saving", async () => {
    const run = await request<DreamRun>("dreaming/run", { botId: mainId });
    await request("dreaming/cancel", { id: run.id });
    const done = await settle(run.id);
    assert.equal(done.state, "cancelled");
    assert.equal(done.saved, 0);
    assert.equal((await request<Memory[]>(`memory?botId=${mainId}`)).length, 0);
  });
  await step("Live dream saves sourced private memory", async () => {
    const run = await request<DreamRun>("dreaming/run", { botId: mainId });
    const done = await settle(run.id);
    report.run = {
      state: done.state,
      saved: done.saved,
      skipped: done.skipped,
      ...(done.errorCode ? { errorCode: done.errorCode } : {}),
    };
    assert.equal(
      done.state,
      "completed",
      `Dream ended ${done.state} (${done.errorCode ?? "no code"})`,
    );
    const memories = await request<Memory[]>(`memory?botId=${mainId}`);
    const dreamed = memories.filter((m) => m.source === "Dreaming");
    report.dreamed = dreamed.map((m) => m.content);
    assert.ok(
      dreamed.some((m) => /cobalt heron/i.test(m.content)),
      "Dreaming must keep the codename",
    );
    assert.ok(
      dreamed.every((m) => m.dream?.sourceMessageIds.includes(chatSource)),
      "Every dreamed note cites the synthetic message",
    );
    const sources = await request<{ content: string | null }[]>(
      `dreaming/sources?botId=${mainId}&runId=${run.id}`,
    );
    assert.ok(sources.some((s) => s.content?.includes(CODENAME)));
  });
  await step(
    "Dreaming does not keep the one-time code",
    async () => {
      const memories = await request<Memory[]>(`memory?botId=${mainId}`);
      assert.ok(
        memories.every((m) => !m.content.includes(ONE_TIME_CODE)),
        "A secret was stored",
      );
    },
    true,
  );
  const ask = async () => {
    await withoutTranscript(mainId);
    await request("chat", {
      botId: mainId,
      content:
        "Synthetic acceptance test. What is my project codename? Reply with the codename only, or UNKNOWN if you have no note of it.",
    });
    return (await request<Message[]>(`messages?botId=${mainId}`))
      .filter((m) => m.role === "assistant")
      .at(-1)!.content;
  };
  await step("Later chat recalls the note from memory alone", async () => {
    assert.match(await ask(), /cobalt heron/i, "Reply must use the note");
  });
  const codenameNote = async () =>
    (await request<Memory[]>(`memory?botId=${mainId}`)).find((m) =>
      /codename/i.test(m.content),
    );
  await step("Manual correction is recalled and protected", async () => {
    const note = (await codenameNote())!;
    const corrected = await request<Memory>("memory", {
      botId: mainId,
      id: note.id,
      content: "Project codename: Amber Kestrel.",
    });
    assert.equal(corrected.source, "User editor");
    assert.match(
      await ask(),
      /amber kestrel/i,
      "Reply must use the correction",
    );
  });
  await step("Forgetting stops recall and is not relearned", async () => {
    const note = (await codenameNote())!;
    await request("memory", { botId: mainId, id: note.id }, "DELETE");
    const reply = await ask();
    assert.doesNotMatch(reply, /cobalt heron|amber kestrel/i);
    // New recall questions are fresh sources; the forgotten statement is suppressed.
    const run = await request<DreamRun>("dreaming/run", { botId: mainId });
    const done = await settle(run.id);
    assert.equal(
      done.state,
      "completed",
      `Re-dream ended ${done.state} (${done.errorCode ?? "no code"})`,
    );
    assert.ok(!done.sourceMessageIds.includes(chatSource));
    assert.equal(await codenameNote(), undefined, "Forgotten fact returned");
    assert.equal(pageErrors.length, 0, "No renderer errors");
  });
  console.log(
    process.exitCode
      ? "Live dreaming flow finished with failed observations."
      : "Live dreaming acceptance passed.",
  );
} catch (error) {
  console.error(
    `Live dreaming acceptance stopped: ${error instanceof Error ? error.message : "Unexpected failure"}`,
  );
  process.exitCode = 1;
} finally {
  await app?.close().catch(() => undefined);
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/live-dreaming.json",
    JSON.stringify(report, null, 2),
  );
  await rm(profile, { recursive: true, force: true });
}
