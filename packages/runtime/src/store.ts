import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { instantiateBot, mainBot } from "@socius/marketplace";
import type { BotInstance } from "@socius/contracts";
import type { Message, Memory, Activity, Task } from "@socius/contracts/app";
import { migrate } from "./migrations.js";
import { ProviderStore } from "./provider-store.js";

export class Store {
  readonly db: DatabaseSync;
  readonly memoryDir: string;
  readonly providers: ProviderStore;
  constructor(readonly dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.memoryDir = join(dir, "memory");
    mkdirSync(this.memoryDir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(dir, "socius.sqlite"));
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
    migrate(this.db);
    this.providers = new ProviderStore(this.db);
    if (!this.all<BotInstance>("bot").length) {
      const bot = instantiateBot(mainBot);
      this.put("bot", bot.id, bot);
      this.event("bot.created", "Socius is ready. Connect a model to begin.");
    }
    for (const task of this.all<Task>("task")) {
      if (task.state === "running") {
        task.state = "failed";
        task.error =
          "The runtime stopped during this task. Retry explicitly; no action was replayed.";
        this.put("task", task.id, task);
        this.event("task.interrupted", task.error);
      }
    }
    this.reconcileMemory();
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
    return this.all<Message>("message").filter((m) => m.botId === botId);
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
    return {
      id,
      botId: meta.botId,
      source: meta.source,
      updatedAt: meta.updatedAt,
      content: text.slice(firstBreak + 1).trim(),
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
  ): Memory {
    const memory = {
      id,
      botId,
      content,
      source,
      updatedAt: new Date().toISOString(),
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
    unlinkSync(join(this.memoryDir, `${id}.md`));
    this.db.prepare("DELETE FROM memory_search WHERE id=?").run(id);
    this.event("memory.deleted", "A memory record was deleted.");
  }
  close() {
    this.db.close();
  }
}
