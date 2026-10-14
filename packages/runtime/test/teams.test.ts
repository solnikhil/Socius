import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRuntime } from "../src/server.js";
import { Store } from "../src/store.js";
import { TeamStore } from "../src/team-store.js";
import type { BotInstance } from "@socius/contracts";
import type {
  Board,
  BoardDetail,
  BoardRun,
  BoardSource,
  Snapshot,
} from "@socius/contracts/app";
import type { ModelRequest, ModelRunner } from "../src/model.js";

interface Call {
  phase: string;
  bot: string;
  title: string;
  prompt: string;
  briefing: string;
}
interface Script {
  plan?: (request: ModelRequest) => unknown;
  task?: (request: ModelRequest, title: string) => string | Promise<string>;
  tokens?: number;
}
/** Deterministic test model. Production never selects it. */
function scripted(script: Script, calls: Call[]): ModelRunner {
  return async (request, onText) => {
    const prompt = String(request.messages[0]?.content ?? "");
    const phase = request.team?.phase ?? "chat";
    const title = /^Task: (.*)$/m.exec(prompt)?.[1] ?? "";
    calls.push({
      phase,
      bot: request.bot.name,
      title,
      prompt,
      briefing: request.briefing ?? "",
    });
    let text: string;
    if (phase === "plan") {
      const plan = script.plan?.(request);
      if (plan) {
        const result = request.proposePlan!(plan) as {
          accepted: boolean;
          errors?: string[];
        };
        if (!result.accepted) throw new Error(result.errors?.join("; "));
        text = "Plan recorded.";
      } else text = "Answered directly by the coordinator.";
    } else if (phase === "task")
      text = await (script.task?.(request, title) ??
        `${request.bot.name} finished ${title}.`);
    else
      text = `Final brief combining: ${[...prompt.matchAll(/from="([^"]+)"/g)].map((m) => m[1]).join(", ")}`;
    request.onUsage?.(script.tokens ?? 10);
    onText(text);
    return text;
  };
}
const blockUntilAborted = (request: ModelRequest) =>
  new Promise<string>((_, reject) => {
    if (request.signal.aborted) reject(new Error("aborted"));
    request.signal.addEventListener("abort", () =>
      reject(new Error("aborted")),
    );
  });
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

async function setup(script: Script, dir?: string) {
  const dataDir = dir ?? (await mkdtemp(join(tmpdir(), "socius-teams-")));
  const calls: Call[] = [];
  const runtime = await startRuntime({
    dataDir,
    runner: scripted(script, calls),
  });
  const pairing = await fetch(runtime.pairingURL, { redirect: "manual" });
  const cookie = pairing.headers.get("set-cookie")!.split(";")[0]!;
  async function call<T = unknown>(
    path: string,
    data?: unknown,
    method = data === undefined ? "GET" : "POST",
  ) {
    const response = await fetch(`${runtime.origin}/api/${path}`, {
      method,
      headers: {
        Cookie: cookie,
        Origin: runtime.origin,
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    return { status: response.status, body: (await response.json()) as T };
  }
  const connection = (
    await call<{ id: string }>("providers", { provider: "ollama" })
  ).body;
  await call("models", { connectionId: connection.id, modelId: "test-model" });
  const main = (await call<Snapshot>("state")).body.bots[0]!;
  const bot = async (name: string, role = name) =>
    (
      await call<BotInstance>("bots", {
        name,
        role,
        instructions: `Work as the ${role}.`,
      })
    ).body;
  const detail = async (id: string) =>
    (await call<BoardDetail>(`boards/detail?id=${id}`)).body;
  return {
    ...runtime,
    dataDir,
    calls,
    call,
    main,
    bot,
    detail,
    cleanup: async () => {
      await runtime.close();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}
type Env = Awaited<ReturnType<typeof setup>>;
async function createBoard(
  env: Env,
  members: BotInstance[],
  budgets: Partial<Board["budgets"]> = {},
  reviewPlan = false,
) {
  const res = await env.call<Board>("boards", {
    name: "Research",
    objective: "Produce a source-backed brief.",
    completionCriteria: "Every claim cites a shared source.",
    memberIds: members.map((m) => m.id),
    coordinatorId: env.main.id,
    budgets,
    reviewPlan,
  });
  assert.equal(res.status, 201);
  return res.body;
}
async function run(env: Env, boardId: string, content = "Write the brief.") {
  const res = await env.call<BoardRun>("boards/runs", { boardId, content });
  assert.equal(res.status, 202, JSON.stringify(res.body));
  return res.body;
}

test("winning workflow: a four-member research board returns one attributed, source-backed result and survives restart", async () => {
  let researcher: BotInstance, writer: BotInstance, reviewer: BotInstance;
  let source: BoardSource;
  const gate = deferred();
  const env = await setup({
    plan: () => ({
      summary:
        "Research the source, draft, then review for unsupported claims.",
      tasks: [
        {
          key: "research",
          title: "Extract findings",
          instructions: "List findings from the shared source.",
          assigneeId: researcher.id,
          dependsOn: [],
          sourceIds: [source.id],
        },
        {
          key: "draft",
          title: "Draft the brief",
          instructions: "Write the brief from the findings.",
          assigneeId: writer.id,
          dependsOn: ["research"],
          sourceIds: [],
        },
        {
          key: "review",
          title: "Review claims",
          instructions: "Flag unsupported claims.",
          assigneeId: reviewer.id,
          dependsOn: ["draft"],
          sourceIds: [source.id],
        },
      ],
    }),
    task: async (request, title) => {
      if (title === "Extract findings") await gate.promise;
      return title === "Review claims"
        ? "Reviewer: the adoption figure is unsupported by the source."
        : `${request.bot.name} contribution for ${title}.`;
    },
  });
  try {
    researcher = await env.bot("Researcher");
    writer = await env.bot("Writer");
    reviewer = await env.bot("Reviewer");
    const board = await createBoard(env, [
      env.main,
      researcher,
      writer,
      reviewer,
    ]);
    assert.equal(board.members.length, 4);
    source = (
      await env.call<BoardSource>("boards/sources", {
        boardId: board.id,
        name: "market-notes.txt",
        text: "SOURCE-TEXT: Local-first assistants are growing.",
      })
    ).body;
    const started = await run(env, board.id);
    assert.equal(
      (await env.call("boards/runs", { boardId: board.id, content: "again" }))
        .status,
      409,
      "a board runs one request at a time",
    );
    gate.resolve();
    await env.engine.idle();
    let detail = await env.detail(board.id);
    const finished = detail.runs.find((r) => r.id === started.id)!;
    assert.equal(finished.state, "completed");
    assert.match(finished.result!, /Researcher, Writer, Reviewer/);
    assert.deepEqual(
      detail.tasks.map((t) => [t.title, t.state, t.attempts]),
      [
        ["Extract findings", "done", 1],
        ["Draft the brief", "done", 1],
        ["Review claims", "done", 1],
      ],
    );
    assert.deepEqual(
      detail.messages.map((m) => m.kind),
      [
        "user",
        "decision",
        "contribution",
        "contribution",
        "contribution",
        "synthesis",
      ],
    );
    const byTitle = (t: string) => env.calls.find((c) => c.title === t)!;
    // Least context: the writer gets the findings but not the unlisted source.
    assert.match(byTitle("Extract findings").prompt, /SOURCE-TEXT/);
    assert.doesNotMatch(byTitle("Draft the brief").prompt, /SOURCE-TEXT/);
    assert.match(byTitle("Draft the brief").prompt, /from="Researcher"/);
    assert.match(byTitle("Review claims").prompt, /from="Writer"/);
    // Planning sees source names only; contents go to the tasks that need them.
    const plan = env.calls.find((c) => c.phase === "plan")!;
    assert.equal(plan.bot, "Socius");
    assert.ok(
      env.calls
        .filter((c) => c.phase === "task")
        .every((c) => c.bot !== "Socius"),
    );
    assert.equal(finished.usage.modelCalls, 5);
    await env.close();
    const again = await setup({}, env.dataDir);
    try {
      detail = await again.detail(board.id);
      assert.equal(detail.runs[0]!.state, "completed");
      assert.equal(detail.messages.at(-1)!.kind, "synthesis");
      assert.equal(detail.sources.length, 1);
    } finally {
      await again.cleanup();
    }
  } catch (e) {
    await env.close().catch(() => {});
    throw e;
  }
});

test("a twelve-member roster has no cap and queues work under the concurrency ceiling", async () => {
  let inFlight = 0,
    peak = 0;
  const specialists: BotInstance[] = [];
  const env = await setup({
    plan: () => ({
      summary: "Everyone contributes one section.",
      tasks: specialists.map((s, i) => ({
        key: `section-${i}`,
        title: `Section ${i}`,
        instructions: "Write your section.",
        assigneeId: s.id,
        dependsOn: [],
        sourceIds: [],
      })),
    }),
    task: async (request, title) => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 15));
      inFlight--;
      return `${request.bot.name}: ${title}`;
    },
  });
  try {
    for (let i = 0; i < 11; i++)
      specialists.push(await env.bot(`Specialist ${i}`));
    const board = await createBoard(
      env,
      [env.main, ...specialists.slice(0, 3)],
      {
        concurrency: 2,
        maxTasks: 20,
      },
    );
    // Members beyond the old three-bot limit are added through the same API.
    for (const s of specialists.slice(3)) {
      const res = await env.call<Board>("boards/members", {
        boardId: board.id,
        botId: s.id,
        role: "Section author",
      });
      assert.equal(res.status, 200);
    }
    assert.equal((await env.detail(board.id)).board.members.length, 12);
    await run(env, board.id);
    await env.engine.idle();
    const detail = await env.detail(board.id);
    assert.equal(detail.runs[0]!.state, "completed");
    assert.equal(detail.tasks.length, 11);
    assert.ok(
      detail.tasks.every((t) => t.state === "done" && t.attempts === 1),
    );
    assert.equal(peak, 2, "the ceiling is reached but never exceeded");
    assert.equal(env.calls.filter((c) => c.phase === "task").length, 11);
  } finally {
    await env.cleanup();
  }
});

test("private memory stays private and a specialist cannot borrow the coordinator's grants", async () => {
  let specialist: BotInstance;
  const seen: { bot: string; memory: unknown; error?: string }[] = [];
  const env = await setup({
    plan: () => ({
      summary: "One task.",
      tasks: [
        {
          key: "look",
          title: "Check memory",
          instructions: "Search memory.",
          assigneeId: specialist.id,
          dependsOn: [],
          sourceIds: [],
        },
      ],
    }),
    task: (request) => {
      try {
        seen.push({
          bot: request.bot.name,
          memory: request.searchMemory("secret"),
        });
      } catch (e) {
        seen.push({
          bot: request.bot.name,
          memory: null,
          error: (e as Error).message,
        });
      }
      return "checked";
    },
  });
  try {
    specialist = await env.bot("Analyst");
    await env.call("grants", { botId: env.main.id, memory: true });
    env.store.saveMemory(env.main.id, "Coordinator secret plan.", "test");
    const board = await createBoard(env, [env.main, specialist]);
    await run(env, board.id);
    await env.engine.idle();
    assert.equal(seen[0]!.memory, null);
    assert.match(seen[0]!.error!, /not granted/);
    // With its own grant the specialist sees only its own namespace.
    await env.call("grants", { botId: specialist.id, memory: true });
    env.store.saveMemory(specialist.id, "Analyst secret notes.", "test");
    const detail = await env.detail(board.id);
    await env
      .call("boards/runs/retry", { id: detail.runs[0]!.id })
      .then((r) =>
        assert.equal(r.status, 409, "completed runs are not retried"),
      );
    await run(env, board.id);
    await env.engine.idle();
    const memory = seen[1]!.memory as { content: string; botId: string }[];
    assert.deepEqual(
      memory.map((m) => m.content),
      ["Analyst secret notes."],
    );
  } finally {
    await env.cleanup();
  }
});

test("a specialist failure blocks dependents, explains outstanding work, and retry reuses completed results", async () => {
  let a: BotInstance, b: BotInstance;
  let failing = true;
  const env = await setup({
    plan: () => ({
      summary: "Two steps.",
      tasks: [
        {
          key: "one",
          title: "Step one",
          instructions: "1",
          assigneeId: a.id,
          dependsOn: [],
          sourceIds: [],
        },
        {
          key: "two",
          title: "Step two",
          instructions: "2",
          assigneeId: b.id,
          dependsOn: ["one"],
          sourceIds: [],
        },
        {
          key: "side",
          title: "Side step",
          instructions: "s",
          assigneeId: a.id,
          dependsOn: [],
          sourceIds: [],
        },
      ],
    }),
    task: (request, title) => {
      if (title === "Step one" && failing)
        throw new Error("provider exploded: sk-secret");
      return `${request.bot.name} did ${title}`;
    },
  });
  try {
    a = await env.bot("Alpha");
    b = await env.bot("Beta");
    const board = await createBoard(env, [env.main, a, b], { concurrency: 1 });
    const started = await run(env, board.id);
    await env.engine.idle();
    let detail = await env.detail(board.id);
    const partial = detail.runs[0]!;
    assert.equal(partial.state, "partial");
    assert.equal(partial.result, null, "no misleading final result");
    assert.match(partial.outcome!, /Step one \(Alpha\): The model call failed/);
    assert.match(partial.outcome!, /Step two \(Beta\): waiting on Step one/);
    assert.doesNotMatch(JSON.stringify(detail), /sk-secret/);
    assert.ok(!detail.messages.some((m) => m.kind === "synthesis"));
    failing = false;
    assert.equal(
      (await env.call("boards/runs/retry", { id: started.id })).status,
      202,
    );
    await env.engine.idle();
    detail = await env.detail(board.id);
    assert.equal(detail.runs[0]!.state, "completed");
    const attempts = Object.fromEntries(
      detail.tasks.map((t) => [t.title, t.attempts]),
    );
    assert.deepEqual(attempts, {
      "Step one": 2,
      "Step two": 1,
      "Side step": 1,
    });
    assert.equal(
      env.calls.filter((c) => c.title === "Side step").length,
      1,
      "completed work is never dispatched twice",
    );
  } finally {
    await env.cleanup();
  }
});

test("call, token and time budgets stop work visibly instead of failing silently", async () => {
  let a: BotInstance, heavyBot: BotInstance;
  const plan = (bot: () => BotInstance) => () => ({
    summary: "Three independent tasks.",
    tasks: ["x", "y", "z"].map((k) => ({
      key: k,
      title: `Task ${k}`,
      instructions: k,
      assigneeId: bot().id,
      dependsOn: [],
      sourceIds: [],
    })),
  });
  const env = await setup({
    plan: plan(() => a),
    task: (request, title) =>
      title === "Task z" && request.limits?.maxSteps === 2
        ? blockUntilAborted(request)
        : "ok",
  });
  try {
    a = await env.bot("Alpha");
    const calls = await createBoard(env, [env.main, a], {
      concurrency: 1,
      maxModelCalls: 3,
    });
    await run(env, calls.id);
    await env.engine.idle();
    let detail = await env.detail(calls.id);
    assert.equal(detail.runs[0]!.state, "partial");
    assert.match(
      detail.runs[0]!.outcome!,
      /model-call budget \(3 per run\) is exhausted/,
    );
    assert.equal(detail.tasks.filter((t) => t.state === "done").length, 1);
    assert.equal(
      detail.runs[0]!.usage.modelCalls,
      2,
      "one call stays reserved for synthesis",
    );

    const heavy = await setup({ plan: plan(() => heavyBot), tokens: 5000 });
    try {
      heavyBot = await heavy.bot("Alpha");
      const board = await createBoard(heavy, [heavy.main, heavyBot], {
        maxRunTokens: 1000,
      });
      await run(heavy, board.id);
      await heavy.engine.idle();
      const d = await heavy.detail(board.id);
      assert.equal(d.runs[0]!.state, "partial");
      assert.match(d.runs[0]!.outcome!, /token budget/);
      assert.equal(heavy.calls.filter((c) => c.phase === "task").length, 0);
    } finally {
      await heavy.cleanup();
    }

    const timed = await createBoard(env, [env.main, a], {
      callTimeoutMs: 1000,
      maxStepsPerCall: 2,
    });
    await run(env, timed.id);
    await env.engine.idle();
    detail = await env.detail(timed.id);
    const z = detail.tasks.find((t) => t.title === "Task z")!;
    assert.equal(z.state, "failed");
    assert.match(z.error!, /exceeded the 1s limit/);
    assert.equal(detail.runs[0]!.state, "partial");
  } finally {
    await env.cleanup();
  }
});

test("cancelling a run reaches active children and prevents queued tasks from starting", async () => {
  let a: BotInstance;
  const working = deferred();
  const env = await setup({
    plan: () => ({
      summary: "Three tasks.",
      tasks: ["x", "y", "z"].map((k) => ({
        key: k,
        title: `Task ${k}`,
        instructions: k,
        assigneeId: a.id,
        dependsOn: [],
        sourceIds: [],
      })),
    }),
    task: (request) => {
      working.resolve();
      return blockUntilAborted(request);
    },
  });
  try {
    a = await env.bot("Alpha");
    const board = await createBoard(env, [env.main, a], { concurrency: 1 });
    const started = await run(env, board.id);
    await working.promise;
    const cancelled = await env.call<BoardRun>("boards/runs/cancel", {
      id: started.id,
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.state, "cancelled");
    assert.equal(cancelled.body.result, null);
    await env.engine.idle();
    const detail = await env.detail(board.id);
    assert.ok(detail.tasks.every((t) => t.state === "cancelled"));
    assert.equal(env.calls.filter((c) => c.phase === "task").length, 1);
    assert.equal(env.calls.filter((c) => c.phase === "synthesize").length, 0);
    assert.ok(!detail.messages.some((m) => m.kind === "synthesis"));
    assert.equal(
      (await env.call("boards/runs/cancel", { id: started.id })).status,
      409,
    );
  } finally {
    await env.cleanup();
  }
});

test("cancelling one task leaves the rest running; removing a member cancels its queued work", async () => {
  let a: BotInstance, b: BotInstance;
  const working = deferred(),
    release = deferred();
  const env = await setup({
    plan: () => ({
      summary: "Parallel work.",
      tasks: [
        {
          key: "slow",
          title: "Slow task",
          instructions: "s",
          assigneeId: a.id,
          dependsOn: [],
          sourceIds: [],
        },
        {
          key: "quick",
          title: "Quick task",
          instructions: "q",
          assigneeId: a.id,
          dependsOn: [],
          sourceIds: [],
        },
        {
          key: "later",
          title: "Later task",
          instructions: "l",
          assigneeId: b.id,
          dependsOn: ["quick"],
          sourceIds: [],
        },
      ],
    }),
    task: async (request, title) => {
      if (title === "Slow task") {
        working.resolve();
        return blockUntilAborted(request);
      }
      if (title === "Quick task") await release.promise;
      return "ok";
    },
  });
  try {
    a = await env.bot("Alpha");
    b = await env.bot("Beta");
    const board = await createBoard(env, [env.main, a, b], { concurrency: 2 });
    await run(env, board.id);
    await working.promise;
    let detail = await env.detail(board.id);
    const slow = detail.tasks.find((t) => t.title === "Slow task")!;
    assert.equal(
      (await env.call("boards/tasks/cancel", { id: slow.id })).status,
      200,
    );
    assert.equal(
      (
        await env.call(
          "boards/members",
          { boardId: board.id, botId: env.main.id },
          "DELETE",
        )
      ).status,
      409,
      "the coordinator cannot be removed",
    );
    assert.equal(
      (
        await env.call(
          "boards/members",
          { boardId: board.id, botId: b.id },
          "DELETE",
        )
      ).status,
      200,
    );
    release.resolve();
    await env.engine.idle();
    detail = await env.detail(board.id);
    const state = Object.fromEntries(
      detail.tasks.map((t) => [t.title, t.state]),
    );
    assert.deepEqual(state, {
      "Slow task": "cancelled",
      "Quick task": "done",
      "Later task": "failed",
    });
    assert.match(
      detail.tasks.find((t) => t.title === "Later task")!.error!,
      /left the board/,
    );
    assert.equal(detail.runs[0]!.state, "partial");
  } finally {
    await env.cleanup();
  }
});

test("specialist memory proposals stay pending with run references and apply only to that specialist", async () => {
  let a: BotInstance;
  const env = await setup({
    plan: () => ({
      summary: "One task.",
      tasks: [
        {
          key: "x",
          title: "Remember",
          instructions: "x",
          assigneeId: a.id,
          dependsOn: [],
          sourceIds: [],
        },
      ],
    }),
    task: (request) => {
      request.proposeMemory("The user prefers short briefs.");
      return "Proposed a memory.";
    },
  });
  try {
    a = await env.bot("Alpha");
    await env.call("grants", { botId: a.id, memory: true });
    const board = await createBoard(env, [env.main, a]);
    const started = await run(env, board.id);
    await env.engine.idle();
    const detail = await env.detail(board.id);
    const approval = (await env.call<Snapshot>("state")).body.approvals[0]!;
    assert.equal(approval.state, "pending");
    assert.equal(approval.runId, started.id);
    assert.equal(approval.taskId, detail.tasks[0]!.id);
    assert.equal(approval.botId, a.id);
    assert.equal(
      env.store.memory(a.id).length,
      0,
      "nothing is written before approval",
    );
    assert.equal(
      (
        await env.call("approvals", {
          id: approval.id,
          digest: approval.digest,
          approve: true,
        })
      ).status,
      200,
    );
    assert.equal(env.store.memory(a.id).length, 1);
    assert.equal(env.store.memory(env.main.id).length, 0);
  } finally {
    await env.cleanup();
  }
});

test("restart marks active runs interrupted without replaying, and an explicit retry finishes them", async () => {
  const dir = await mkdtemp(join(tmpdir(), "socius-teams-restart-"));
  const env = await setup({}, dir);
  const a = await env.bot("Alpha");
  const board = await createBoard(env, [env.main, a]);
  await env.close();
  // Simulate a crash mid-run: one task finished, one was working, one queued.
  const store = new Store(dir),
    teams = new TeamStore(store);
  const runId = crypto.randomUUID(),
    now = new Date().toISOString();
  teams.saveRun({
    id: runId,
    boardId: board.id,
    request: "Write the brief.",
    coordinatorId: env.main.id,
    state: "running",
    outcome: null,
    result: null,
    usage: { modelCalls: 2, tokens: 20 },
    revisions: [],
    createdAt: now,
    finishedAt: null,
  });
  for (const [key, state, result] of [
    ["one", "done", "Finished earlier."],
    ["two", "working", null],
    ["three", "backlog", null],
  ] as const)
    teams.saveTask({
      id: crypto.randomUUID(),
      boardId: board.id,
      runId,
      key,
      title: `Task ${key}`,
      instructions: key,
      assigneeId: a.id,
      dependsOn: key === "three" ? ["two"] : [],
      sourceIds: [],
      state,
      result,
      error: null,
      attempts: state === "backlog" ? 0 : 1,
      createdAt: now,
      startedAt: now,
      finishedAt: null,
    });
  store.close();
  const after = await setup({}, dir);
  try {
    let detail = await after.detail(board.id);
    assert.equal(detail.runs[0]!.state, "interrupted");
    assert.match(detail.runs[0]!.outcome!, /nothing was replayed/);
    const state = Object.fromEntries(detail.tasks.map((t) => [t.key, t.state]));
    assert.deepEqual(state, {
      one: "done",
      two: "interrupted",
      three: "backlog",
    });
    assert.equal(after.calls.length, 0, "no model call happens on restart");
    assert.equal(
      (await after.call("boards/runs/retry", { id: runId })).status,
      202,
    );
    await after.engine.idle();
    detail = await after.detail(board.id);
    assert.equal(detail.runs[0]!.state, "completed");
    assert.deepEqual(
      after.calls.filter((c) => c.phase === "task").map((c) => c.title),
      ["Task two", "Task three"],
    );
  } finally {
    await after.cleanup();
  }
});

test("coordinators can answer directly; archived boards are read-only", async () => {
  const env = await setup({});
  try {
    const board = await createBoard(env, [env.main]);
    await run(env, board.id, "Quick question.");
    await env.engine.idle();
    const detail = await env.detail(board.id);
    assert.equal(detail.runs[0]!.state, "completed");
    assert.equal(
      detail.runs[0]!.result,
      "Answered directly by the coordinator.",
    );
    assert.equal(
      (await env.call("boards/update", { id: board.id, archived: true }))
        .status,
      200,
    );
    assert.equal(
      (await env.call("boards/runs", { boardId: board.id, content: "x" }))
        .status,
      409,
    );
    assert.equal(
      (
        await env.call("boards/sources", {
          boardId: board.id,
          name: "n",
          text: "t",
        })
      ).status,
      409,
    );
    assert.equal(
      (await env.call("boards/update", { id: board.id, archived: false }))
        .status,
      200,
    );
    assert.equal(
      (
        await env.call("boards", {
          name: "Bad",
          objective: "x",
          memberIds: [env.main.id],
          coordinatorId: crypto.randomUUID(),
        })
      ).status,
      400,
    );
  } finally {
    await env.cleanup();
  }
});

test("plans wait in the thread for review; a chat reply revises them and Run plan executes once", async () => {
  let a: BotInstance, b: BotInstance;
  let short = false;
  const env = await setup({
    plan: (request) => {
      short = /keep it to one step/i.test(String(request.messages[0]?.content));
      return {
        summary: short ? "One step, as you asked." : "Two steps.",
        tasks: short
          ? [
              {
                key: "only",
                title: "Only step",
                instructions: "Do it all.",
                assigneeId: a.id,
                dependsOn: [],
                sourceIds: [],
              },
            ]
          : [
              {
                key: "one",
                title: "Gather",
                instructions: "Gather.",
                assigneeId: a.id,
                dependsOn: [],
                sourceIds: [],
              },
              {
                key: "two",
                title: "Write up",
                instructions: "Write.",
                assigneeId: b.id,
                dependsOn: ["one"],
                sourceIds: [],
              },
            ],
      };
    },
  });
  try {
    a = await env.bot("Gatherer", "Collects facts from sources");
    b = await env.bot("Author", "Writes the final copy");
    const board = await createBoard(env, [env.main, a, b], {}, true);
    const started = await run(env, board.id, "Summarise the notes.");
    await env.engine.idle();
    let detail = await env.detail(board.id);
    assert.equal(detail.runs[0]!.state, "awaiting-approval");
    assert.equal(detail.tasks.length, 2);
    assert.equal(
      env.calls.filter((c) => c.phase === "task").length,
      0,
      "nothing runs before approval",
    );
    assert.match(detail.messages.at(-1)!.content, /Reply to change this plan/);

    // Steering happens in the chat: the reply revises the same run.
    const revised = await run(env, board.id, "Keep it to one step.");
    assert.equal(revised.id, started.id);
    await env.engine.idle();
    const replan = env.calls.filter((c) => c.phase === "plan").at(-1)!;
    assert.match(replan.prompt, /plan draft 1:\n- one: Gather → Gatherer/);
    assert.match(replan.prompt, /The user replied: Keep it to one step\./);
    detail = await env.detail(board.id);
    assert.equal(detail.runs.length, 1);
    assert.deepEqual(
      detail.tasks.map((t) => t.title),
      ["Only step"],
    );
    assert.equal(detail.runs[0]!.state, "awaiting-approval");

    // Restart keeps the pending plan; nothing is replayed.
    await env.close();
    const after = await setup({}, env.dataDir);
    try {
      assert.equal(
        (await after.detail(board.id)).runs[0]!.state,
        "awaiting-approval",
      );
      assert.equal(
        (await after.call("boards/runs/approve", { id: started.id })).status,
        202,
      );
      assert.equal(
        (await after.call("boards/runs/approve", { id: started.id })).status,
        409,
      );
      await after.engine.idle();
      detail = await after.detail(board.id);
      assert.equal(detail.runs[0]!.state, "completed");
      assert.deepEqual(
        after.calls.filter((c) => c.phase === "task").map((c) => c.title),
        ["Only step"],
      );
    } finally {
      await after.cleanup();
    }
  } catch (e) {
    await env.close().catch(() => {});
    throw e;
  }
});

test("a plan awaiting review can be discarded, and the board then accepts new requests", async () => {
  let a: BotInstance;
  const env = await setup({
    plan: () => ({
      summary: "One step.",
      tasks: [
        {
          key: "x",
          title: "Step",
          instructions: "x",
          assigneeId: a.id,
          dependsOn: [],
          sourceIds: [],
        },
      ],
    }),
  });
  try {
    a = await env.bot("Alpha");
    const board = await createBoard(env, [env.main, a], {}, true);
    const started = await run(env, board.id);
    await env.engine.idle();
    const cancelled = await env.call<BoardRun>("boards/runs/cancel", {
      id: started.id,
    });
    assert.equal(cancelled.body.state, "cancelled");
    assert.equal((await env.detail(board.id)).tasks[0]!.state, "cancelled");
    const next = await run(env, board.id, "Another request.");
    assert.notEqual(next.id, started.id);
  } finally {
    await env.cleanup();
  }
});

test("specialists see teammates' descriptions, who handed them work and who receives theirs", async () => {
  let a: BotInstance, b: BotInstance, c: BotInstance;
  const env = await setup({
    plan: () => ({
      summary: "Chain.",
      tasks: [
        {
          key: "find",
          title: "Find",
          instructions: "f",
          assigneeId: a.id,
          dependsOn: [],
          sourceIds: [],
        },
        {
          key: "draft",
          title: "Draft",
          instructions: "d",
          assigneeId: b.id,
          dependsOn: ["find"],
          sourceIds: [],
        },
        {
          key: "check",
          title: "Check",
          instructions: "c",
          assigneeId: c.id,
          dependsOn: ["draft"],
          sourceIds: [],
        },
      ],
    }),
  });
  try {
    a = await env.bot("Finder", "Finds evidence in sources");
    b = await env.bot("Drafter", "Writes clear briefs");
    c = await env.bot("Checker", "Checks claims");
    const board = await createBoard(env, [env.main, a, b, c]);
    // A board role overrides the bot's own description for this board.
    await env.call("boards/members", {
      boardId: board.id,
      botId: c.id,
      role: "Fact-checks every number",
    });
    await run(env, board.id);
    await env.engine.idle();
    const draft = env.calls.find((x) => x.title === "Draft")!;
    assert.match(
      draft.prompt,
      /<teammate-result from="Finder" role="Finds evidence in sources" task="Find">/,
    );
    assert.match(
      draft.prompt,
      /handed to:\n- Checker \(Fact-checks every number\) for "Check"/,
    );
    assert.match(draft.briefing, /- Finder: Finds evidence in sources/);
    assert.match(draft.briefing, /- Checker: Fact-checks every number/);
    assert.match(draft.briefing, /Your board role: Writes clear briefs/);
    assert.doesNotMatch(draft.briefing, /- Drafter:/);
  } finally {
    await env.cleanup();
  }
});
