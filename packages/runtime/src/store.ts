import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { instantiateBot, mainBot } from "@socius/marketplace";
import type { BotInstance } from "@socius/contracts";
import type {
  ActionRecord,
  Message,
  Memory,
  Activity,
  Task,
  Approval,
  Category,
  GroupChat,
} from "@socius/contracts/app";
import { migrate } from "./migrations.js";
import { ProviderStore } from "./provider-store.js";

export class Store {
  readonly db: DatabaseSync;
  readonly memoryDir: string;
  /** Content-addressed, immutable release files: releases/<digest>/... */
  readonly releasesDir: string;
  /** Scratch space for imports; never active, cleared on start. */
  readonly stagingDir: string;
  readonly exportsDir: string;
  readonly providers: ProviderStore;
  constructor(readonly dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.memoryDir = join(dir, "memory");
    mkdirSync(this.memoryDir, { recursive: true, mode: 0o700 });
    this.releasesDir = join(dir, "packages", "releases");
    this.stagingDir = join(dir, "packages", "staging");
    this.exportsDir = join(dir, "exports");
    for (const d of [this.releasesDir, this.stagingDir, this.exportsDir])
      mkdirSync(d, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(dir, "socius.sqlite"));
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
    migrate(this.db);
    this.providers = new ProviderStore(this.db);
    if (!this.all<BotInstance>("bot").length) {
      const bot = instantiateBot(mainBot);
      this.put("bot", bot.id, bot);
      this.event("bot.created", "Socius is ready. Connect a model to begin.");
    }
    // Socius's instructions are not user-editable, so a newer release replaces them.
    for (const bot of this.all<BotInstance>("bot")) {
      if (
        bot.template.id !== mainBot.id ||
        bot.template.version === mainBot.version
      )
        continue;
      this.put("bot", bot.id, {
        ...bot,
        template: { id: mainBot.id, version: mainBot.version },
        role: mainBot.role,
        instructions: mainBot.instructions,
      });
      this.event(
        "bot.updated",
        "Socius was updated to its latest instructions.",
      );
    }
    for (const task of this.all<Task>("task")) {
      if (task.state === "running") {
        task.state = "failed";
        // Routine attempts are recovered by the routine engine from their checkpoints.
        task.error = task.routineRunId
          ? "The runtime stopped during this routine attempt. Completed steps are kept; the run resumes or stops by its recovery policy."
          : "The runtime stopped during this task. Retry explicitly; no action was replayed.";
        this.put("task", task.id, task);
        this.event("task.interrupted", task.error);
      }
    }
    // A write that was mid-flight when the runtime stopped has an unknown outcome.
    for (const action of this.all<ActionRecord>("action")) {
      if (action.state !== "executing") continue;
      const attempt = action.attempts.at(-1);
      if (attempt && !attempt.finishedAt) {
        attempt.finishedAt = new Date().toISOString();
        attempt.outcome = "ambiguous";
        attempt.detail =
          "Socius stopped before the service confirmed the outcome.";
      }
      action.state = "unknown";
      action.retryable = false;
      action.error =
        "Socius stopped during this change. Check the result before retrying; it was not repeated.";
      action.updatedAt = new Date().toISOString();
      this.put("action", action.id, action);
      this.event(
        "action.interrupted",
        `An approved change needs checking: ${action.summary}`,
      );
    }
    this.cleanPackages();
    this.reconcileMemory();
    for (const deletion of this.all<{ id: string; botId: string }>("memory-delete")) this.finishMemoryDelete(deletion.id);
    for (const deletion of this.all<{ id: string }>("bot-delete")) this.deleteBot(deletion.id);
  }
  /** Removes interrupted imports: staging leftovers and release files without a record. */
  cleanPackages() {
    for (const entry of readdirSync(this.stagingDir))
      rmSync(join(this.stagingDir, entry), { recursive: true, force: true });
    const known = new Set(
      this.all<{ digest: string }>("release").map((r) => r.digest),
    );
    for (const entry of readdirSync(this.releasesDir))
      if (!known.has(entry))
        rmSync(join(this.releasesDir, entry), { recursive: true, force: true });
  }
  connectionSecret(connectionId: string): string | undefined {
    return this.db
      .prepare("SELECT secret FROM connector_secrets WHERE connection_id=?")
      .get(connectionId)?.secret as string | undefined;
  }
  saveConnectionSecret(connectionId: string, secret: string) {
    this.db
      .prepare(
        "INSERT INTO connector_secrets VALUES(?,?,?) ON CONFLICT(connection_id) DO UPDATE SET secret=excluded.secret, updated_at=excluded.updated_at",
      )
      .run(connectionId, secret, new Date().toISOString());
  }
  deleteConnectionSecret(connectionId: string) {
    this.db
      .prepare("DELETE FROM connector_secrets WHERE connection_id=?")
      .run(connectionId);
  }
  all<T>(kind: string): T[] {
    return this.db
      .prepare("SELECT data FROM records WHERE kind=? ORDER BY rowid")
      .all(kind)
      .map((r) => JSON.parse(r.data as string) as T);
  }
  get<T>(kind: string, id: string): T | undefined {
    const row = this.db
      .prepare("SELECT data FROM records WHERE kind=? AND id=?")
      .get(kind, id);
    return row ? (JSON.parse(row.data as string) as T) : undefined;
  }
  put(kind: string, id: string, data: unknown) {
    this.db
      .prepare(
        "INSERT INTO records VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",
      )
      .run(kind, id, JSON.stringify(data));
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  event(kind: string, description: string) {
    const event: Activity = {
      id: randomUUID(),
      kind,
      description,
      createdAt: new Date().toISOString(),
    };
    this.put("activity", event.id, event);
  }
  messages(botId: string): Message[] {
    return this.all<Message>("message").filter(
      (m) => m.botId === botId && !m.groupId,
    );
  }
  groupMessages(groupId: string): Message[] {
    return this.all<Message>("message").filter((m) => m.groupId === groupId);
  }
  delete(kind: string, id: string) {
    this.db.prepare("DELETE FROM records WHERE kind=? AND id=?").run(kind, id);
  }
  private indexMemory(memory: Memory) {
    this.db.prepare("DELETE FROM memory_search WHERE id=?").run(memory.id);
    this.db
      .prepare("INSERT INTO memory_search VALUES(?,?,?)")
      .run(memory.id, memory.botId, memory.content);
  }
  private readMemoryFile(id: string): Memory {
    const text = readFileSync(join(this.memoryDir, `${id}.md`), "utf8");
    const firstBreak = text.indexOf("\n");
    const meta = JSON.parse(
      text
        .slice(0, firstBreak)
        .replace(/^<!-- /, "")
        .replace(/ -->$/, ""),
    );
    if (
      meta.id !== id ||
      typeof meta.botId !== "string" ||
      typeof meta.source !== "string"
    )
      throw new Error("Invalid memory metadata");
    if (
      meta.dream &&
      (typeof meta.dream.runId !== "string" ||
        !Array.isArray(meta.dream.sourceMessageIds) ||
        meta.dream.sourceMessageIds.length > 48 ||
        !meta.dream.sourceMessageIds.every(
          (id: unknown) => typeof id === "string" && /^[\da-f-]{36}$/.test(id),
        ))
    )
      throw new Error("Invalid dream provenance");
    return {
      id,
      botId: meta.botId,
      source: meta.source,
      updatedAt: meta.updatedAt,
      content: text.slice(firstBreak + 1).trim(),
      ...(meta.dream ? { dream: meta.dream } : {}),
    };
  }
  reconcileMemory() {
    this.transaction(() => {
      this.db.exec("DELETE FROM memory_search");
      for (const file of readdirSync(this.memoryDir)) {
        if (!/^[\da-f-]{36}\.md$/.test(file)) continue;
        try {
          this.indexMemory(this.readMemoryFile(file.slice(0, -3)));
        } catch {
          /* Invalid files are excluded, never interpreted as instructions. */
        }
      }
    });
  }
  memory(botId: string): Memory[] {
    this.reconcileMemory();
    return this.db
      .prepare("SELECT id FROM memory_search WHERE botId=?")
      .all(botId)
      .map((r) => this.readMemoryFile(r.id as string));
  }
  searchMemory(botId: string, query: string): Memory[] {
    this.reconcileMemory();
    const terms = query.match(/[\p{L}\p{N}]+/gu)?.slice(0, 12) ?? [];
    if (!terms.length) return this.memory(botId).slice(0, 8);
    const match = terms.map((t) => `"${t}"`).join(" OR ");
    return this.db
      .prepare(
        "SELECT id FROM memory_search WHERE memory_search MATCH ? AND botId=? ORDER BY rank LIMIT 8",
      )
      .all(match, botId)
      .map((r) => this.readMemoryFile(r.id as string));
  }
  saveMemory(
    botId: string,
    content: string,
    source: string,
    id: string = randomUUID(),
    dream?: Memory["dream"],
  ): Memory {
    const memory = {
      id,
      botId,
      content,
      source,
      updatedAt: new Date().toISOString(),
      ...(dream ? { dream } : {}),
    };
    const path = join(this.memoryDir, `${id}.md`),
      temp = `${path}.${randomUUID()}.tmp`;
    const { content: _content, ...meta } = memory;
    writeFileSync(temp, `<!-- ${JSON.stringify(meta)} -->\n${content}\n`, {
      mode: 0o600,
    });
    renameSync(temp, path);
    this.indexMemory(memory);
    this.event("memory.saved", "A memory record was saved.");
    return memory;
  }
  deleteMemory(id: string) {
    const memory = this.readMemoryFile(id);
    // Journal and suppression commit together BEFORE deleting the file.
    this.transaction(() => {
      this.put("memory-delete", id, { id, botId: memory.botId });
      for (const sourceId of memory.dream?.sourceMessageIds ?? []) this.put("dream-suppressed", sourceId, { botId: memory.botId });
    });
    this.finishMemoryDelete(id);
  }
  private finishMemoryDelete(id: string) {
    rmSync(join(this.memoryDir, `${id}.md`), { force: true });
    this.transaction(() => {
      this.db.prepare("DELETE FROM memory_search WHERE id=?").run(id);
      this.delete("memory-delete", id);
      this.event("memory.deleted", "A memory record was deleted.");
    });
  }
  /** Recoverable deletion: no filesystem mutations inside a rollbackable SQLite transaction. */
  deleteBot(id: string) {
    this.put("bot-delete", id, { id });
    for (const memory of this.memory(id)) this.deleteMemory(memory.id);
    this.transaction(() => {
      for (const f of this.all<Category>("folder")) if (f.botIds.includes(id)) this.put("folder", f.id, { ...f, botIds: f.botIds.filter((b) => b !== id) });
      for (const g of this.all<GroupChat>("group")) if (g.memberIds.includes(id)) this.put("group", g.id, { ...g, memberIds: g.memberIds.filter((b) => b !== id) });
      for (const m of this.all<Message>("message")) if (m.botId === id && !m.groupId) this.delete("message", m.id);
      for (const a of this.all<Approval>("approval")) if (a.botId === id && a.state === "pending") this.delete("approval", a.id);
      for (const kind of ["dream-run", "dream-processed", "dream-suppressed", "dream-last", "skill-assignment", "skill-review", "connector-grant"]) {
        for (const row of this.db.prepare("SELECT id, data FROM records WHERE kind=?").all(kind)) {
          if (JSON.parse(row.data as string).botId === id) this.delete(kind, row.id as string);
        }
      }
      this.providers.select(`bot:${id}`, null);
      this.delete("bot-layout", id);
      this.delete("bot", id);
      this.delete("bot-delete", id);
      this.event("bot.deleted", "A specialist and its private data were deleted.");
    });
  }
  close() {
    this.db.close();
  }
}
