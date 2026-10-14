import type { BotInstance } from "@socius/contracts";
import type {
  Board,
  BoardDetail,
  BoardMessage,
  BoardRun,
  BoardSource,
  BoardTask,
} from "@socius/contracts/app";
import type { TeamRepository } from "@socius/teams/engine";
import type { Store } from "./store.js";

type Kind = "board" | "source" | "run" | "task" | "message";

/** SQLite-backed board persistence (migration 2). Records are versioned JSON keyed by board. */
export class TeamStore implements TeamRepository {
  constructor(private readonly store: Store) {}
  private put(kind: Kind, id: string, boardId: string, data: unknown) {
    this.store.db
      .prepare(
        "INSERT INTO team_records VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",
      )
      .run(kind, id, boardId, JSON.stringify(data));
  }
  private one<T>(kind: Kind, id: string): T | undefined {
    const row = this.store.db
      .prepare("SELECT data FROM team_records WHERE kind=? AND id=?")
      .get(kind, id);
    return row ? (JSON.parse(row.data as string) as T) : undefined;
  }
  private list<T>(kind: Kind, boardId?: string): T[] {
    const rows = boardId
      ? this.store.db
          .prepare(
            "SELECT data FROM team_records WHERE kind=? AND board_id=? ORDER BY rowid",
          )
          .all(kind, boardId)
      : this.store.db
          .prepare("SELECT data FROM team_records WHERE kind=? ORDER BY rowid")
          .all(kind);
    return rows.map((r) => JSON.parse(r.data as string) as T);
  }
  boards() {
    return this.list<Board>("board").map(normalizeBoard);
  }
  board(id: string) {
    const board = this.one<Board>("board", id);
    return board && normalizeBoard(board);
  }
  saveBoard(board: Board) {
    this.put("board", board.id, board.id, board);
  }
  bot(id: string) {
    return this.store.get<BotInstance>("bot", id);
  }
  sources(boardId: string) {
    return this.list<BoardSource>("source", boardId);
  }
  saveSource(source: BoardSource) {
    this.put("source", source.id, source.boardId, source);
  }
  deleteSource(id: string) {
    this.store.db
      .prepare("DELETE FROM team_records WHERE kind='source' AND id=?")
      .run(id);
  }
  runs(boardId?: string) {
    return this.list<BoardRun>("run", boardId).map(normalizeRun);
  }
  run(id: string) {
    const run = this.one<BoardRun>("run", id);
    return run && normalizeRun(run);
  }
  saveRun(run: BoardRun) {
    this.put("run", run.id, run.boardId, run);
  }
  tasks(runId: string) {
    const run = this.run(runId);
    return run
      ? this.list<BoardTask>("task", run.boardId).filter(
          (t) => t.runId === runId,
        )
      : [];
  }
  task(id: string) {
    return this.one<BoardTask>("task", id);
  }
  deleteTasks(runId: string) {
    for (const task of this.tasks(runId))
      this.store.db
        .prepare("DELETE FROM team_records WHERE kind='task' AND id=?")
        .run(task.id);
  }
  saveTask(task: BoardTask) {
    this.put("task", task.id, task.boardId, task);
  }
  addMessage(message: BoardMessage) {
    this.put("message", message.id, message.boardId, message);
  }
  detail(boardId: string): BoardDetail | undefined {
    const board = this.board(boardId);
    return board
      ? {
          board: normalizeBoard(board),
          sources: this.sources(boardId),
          runs: this.runs(boardId),
          tasks: this.list<BoardTask>("task", boardId),
          messages: this.list<BoardMessage>("message", boardId),
        }
      : undefined;
  }
  transaction<T>(fn: () => T): T {
    // Engine calls nest (a claim inside a larger update); only the outermost opens one.
    if (this.store.db.isTransaction) return fn();
    return this.store.transaction(fn);
  }
  event(kind: string, description: string) {
    this.store.event(kind, description);
  }
}

// Fields added after schemaVersion 1 shipped; older records read with defaults.
function normalizeBoard(board: Board): Board {
  return { ...board, reviewPlan: board.reviewPlan ?? true };
}
function normalizeRun(run: BoardRun): BoardRun {
  return { ...run, revisions: run.revisions ?? [] };
}
