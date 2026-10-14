import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { BotInstance } from "@socius/contracts";
import type { Board, BoardMember } from "@socius/contracts/app";
import {
  CreateBoardSchema,
  MemberSchema,
  RunRequestSchema,
  SourceSchema,
  UpdateBoardSchema,
  defaultBudgets,
} from "@socius/teams";
import type { Invoke, TeamEngine } from "@socius/teams/engine";
import type { Store } from "./store.js";
import type { TeamStore } from "./team-store.js";
import type { ModelRunner } from "./model.js";
import { body, fail, json } from "./http.js";

const uuid = z.string().uuid();

/**
 * Adapts one engine invocation to the model runner. The bot is re-read and its
 * own grants are checked on every tool call: board roles and delegation confer
 * no authority, and only that bot's private memory is reachable.
 */
export function createInvoke(deps: {
  store: Store;
  runner: ModelRunner;
  apiKey: () => Promise<string | undefined>;
  skills: () => string[];
  proposeMemory: (
    botId: string,
    taskId: string,
    runId: string,
    content: string,
  ) => { approvalId: string };
}): Invoke {
  return async (inv) => {
    const current = () =>
      deps.store.get<BotInstance>("bot", inv.bot.id) ??
      fail(404, "Bot not found");
    const allowed = (capability: "memory.read" | "memory.write") => {
      if (!current().grantedCapabilities.includes(capability))
        fail(403, "Memory access is not granted to this bot");
    };
    return deps.runner(
      {
        settings: deps.store.settings(),
        apiKey: await deps.apiKey(),
        bot: current(),
        messages: [{ role: "user", content: inv.prompt }],
        skills: deps.skills(),
        team: {
          phase: inv.phase,
          boardId: inv.board.id,
          runId: inv.run.id,
          taskId: inv.task?.id ?? null,
        },
        briefing: inv.briefing,
        limits: inv.limits,
        onUsage: inv.onUsage,
        signal: inv.signal,
        ...(inv.proposePlan ? { proposePlan: inv.proposePlan } : {}),
        searchMemory: (query) => {
          allowed("memory.read");
          return deps.store.searchMemory(inv.bot.id, query);
        },
        proposeMemory: (content) => {
          allowed("memory.write");
          return deps.proposeMemory(
            inv.bot.id,
            inv.task?.id ?? inv.run.id,
            inv.run.id,
            content,
          );
        },
      },
      () => {},
    );
  };
}

export async function handleBoards(ctx: {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  store: Store;
  teams: TeamStore;
  engine: TeamEngine;
}): Promise<boolean> {
  const { req, res, url, store, teams, engine } = ctx;
  const path = url.pathname,
    method = req.method;
  const board = (id: string) =>
    teams.board(uuid.parse(id)) ?? fail(404, "Board not found");
  const editable = (id: string) => {
    const b = board(id);
    if (b.archivedAt) fail(409, "Archived boards are read-only");
    return b;
  };
  const bot = (id: string) =>
    store.get<BotInstance>("bot", id) ?? fail(404, "Bot not found");
  const save = (b: Board, description: string) => {
    b.updatedAt = new Date().toISOString();
    teams.saveBoard(b);
    store.event("board.updated", description);
  };

  if (method === "GET" && path === "/api/boards/detail") {
    json(res, 200, teams.detail(board(url.searchParams.get("id") ?? "").id));
    return true;
  }
  if (method === "POST" && path === "/api/boards") {
    const input = CreateBoardSchema.parse(await body(req));
    if (!input.memberIds.includes(input.coordinatorId))
      fail(400, "The coordinator must be a board member");
    const now = new Date().toISOString();
    const created: Board = {
      schemaVersion: 1,
      id: randomUUID(),
      name: input.name,
      objective: input.objective,
      completionCriteria: input.completionCriteria,
      coordinatorId: input.coordinatorId,
      members: input.memberIds.map((id) => ({
        botId: bot(id).id,
        role: "",
        joinedAt: now,
      })),
      budgets: { ...defaultBudgets, ...stripUndefined(input.budgets) },
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    teams.saveBoard(created);
    store.event(
      "board.created",
      `Created board ${created.name} with ${created.members.length} members.`,
    );
    json(res, 201, created);
    return true;
  }
  if (method === "POST" && path === "/api/boards/update") {
    const input = UpdateBoardSchema.extend({ id: uuid }).parse(await body(req));
    const b = board(input.id);
    if (input.archived !== undefined) {
      if (input.archived && engine.isBusy(b.id))
        fail(409, "Stop the active run before archiving");
      b.archivedAt = input.archived ? new Date().toISOString() : null;
    } else if (b.archivedAt) fail(409, "Archived boards are read-only");
    if (input.name !== undefined) b.name = input.name;
    if (input.objective !== undefined) b.objective = input.objective;
    if (input.completionCriteria !== undefined)
      b.completionCriteria = input.completionCriteria;
    if (input.coordinatorId !== undefined) {
      // Applies to the next run; an active run keeps the coordinator it started with.
      if (!b.members.some((m) => m.botId === input.coordinatorId))
        fail(400, "The coordinator must be a board member");
      b.coordinatorId = input.coordinatorId;
    }
    if (input.budgets)
      b.budgets = { ...b.budgets, ...stripUndefined(input.budgets) };
    save(b, `Updated board ${b.name}.`);
    json(res, 200, b);
    return true;
  }
  if (path === "/api/boards/members" && method === "POST") {
    const input = MemberSchema.extend({ boardId: uuid }).parse(await body(req));
    const b = editable(input.boardId),
      added = bot(input.botId);
    const existing = b.members.find((m) => m.botId === added.id);
    if (existing) existing.role = input.role;
    else {
      const member: BoardMember = {
        botId: added.id,
        role: input.role,
        joinedAt: new Date().toISOString(),
      };
      b.members.push(member);
    }
    save(
      b,
      existing
        ? `Updated ${added.name}'s role on ${b.name}.`
        : `Added ${added.name} to ${b.name}.`,
    );
    json(res, 200, b);
    return true;
  }
  if (path === "/api/boards/members" && method === "DELETE") {
    const input = z
      .strictObject({ boardId: uuid, botId: uuid })
      .parse(await body(req));
    const b = editable(input.boardId);
    if (b.coordinatorId === input.botId)
      fail(409, "Choose another coordinator before removing this one");
    if (!b.members.some((m) => m.botId === input.botId))
      fail(404, "Not a board member");
    // Queued tasks for a removed member are cancelled when they would start.
    b.members = b.members.filter((m) => m.botId !== input.botId);
    save(b, `Removed a member from ${b.name}.`);
    json(res, 200, b);
    return true;
  }
  if (path === "/api/boards/sources" && method === "POST") {
    const input = SourceSchema.extend({ boardId: uuid }).parse(await body(req));
    const b = editable(input.boardId);
    const source = {
      id: randomUUID(),
      boardId: b.id,
      name: input.name,
      text: input.text,
      addedAt: new Date().toISOString(),
    };
    teams.saveSource(source);
    store.event("board.source.added", `Shared a source on ${b.name}.`);
    json(res, 201, source);
    return true;
  }
  if (path === "/api/boards/sources" && method === "DELETE") {
    const input = z
      .strictObject({ boardId: uuid, id: uuid })
      .parse(await body(req));
    const b = editable(input.boardId);
    if (!teams.sources(b.id).some((s) => s.id === input.id))
      fail(404, "Source not found");
    teams.deleteSource(input.id);
    store.event("board.source.removed", `Removed a source from ${b.name}.`);
    json(res, 200, { ok: true });
    return true;
  }
  if (method === "POST" && path === "/api/boards/runs") {
    const input = RunRequestSchema.extend({ boardId: uuid }).parse(
      await body(req),
    );
    if (!store.settings().model) fail(409, "Choose a model in Settings first");
    json(res, 202, engine.start(board(input.boardId).id, input.content));
    return true;
  }
  if (method === "POST" && path === "/api/boards/runs/cancel") {
    const input = z.strictObject({ id: uuid }).parse(await body(req));
    await engine.cancelRun(input.id);
    json(res, 200, teams.run(input.id));
    return true;
  }
  if (method === "POST" && path === "/api/boards/runs/retry") {
    const input = z.strictObject({ id: uuid }).parse(await body(req));
    if (!store.settings().model) fail(409, "Choose a model in Settings first");
    json(res, 202, engine.retry(input.id));
    return true;
  }
  if (method === "POST" && path === "/api/boards/tasks/cancel") {
    const input = z.strictObject({ id: uuid }).parse(await body(req));
    engine.cancelTask(input.id);
    json(res, 200, { ok: true });
    return true;
  }
  if (method === "POST" && path === "/api/boards/stop") {
    const input = z.strictObject({ boardId: uuid }).parse(await body(req));
    json(res, 200, {
      stopped: await engine.stopBoard(board(input.boardId).id),
    });
    return true;
  }
  return false;
}

function stripUndefined<T extends object>(value: T | undefined) {
  return Object.fromEntries(
    Object.entries(value ?? {}).filter(([, v]) => v !== undefined),
  ) as { [K in keyof T]-?: Exclude<T[K], undefined> };
}
