// Typed persistence for routines, runs, checkpoints, watcher state,
// notifications and the runtime ownership lease. Routine tables are separate
// from general records so claims can rely on SQLite uniqueness constraints.
import type { DatabaseSync } from "node:sqlite";
import type {
  Routine,
  RoutineNotification,
  RoutineRun,
  RunState,
  RunStep,
  WatcherState,
} from "@socius/contracts/routines";
import type { Store } from "../store.js";

/** Thrown when this runtime no longer owns execution. Nothing was written. */
export class FencedError extends Error {
  constructor() {
    super("Another Socius runtime took over routine execution.");
  }
}
export const ACTIVE_RUN_STATES: RunState[] = ["queued", "running"];

export class RoutineRecords {
  private readonly db: DatabaseSync;
  constructor(readonly store: Store) {
    this.db = store.db;
  }
  // Routines
  routines(botId?: string): Routine[] {
    const rows = botId
      ? this.db
          .prepare("SELECT data FROM routines WHERE bot_id=? ORDER BY rowid")
          .all(botId)
      : this.db.prepare("SELECT data FROM routines ORDER BY rowid").all();
    return rows.map((r) => JSON.parse(r.data as string) as Routine);
  }
  routine(id: string): Routine | undefined {
    const row = this.db.prepare("SELECT data FROM routines WHERE id=?").get(id);
    return row ? (JSON.parse(row.data as string) as Routine) : undefined;
  }
  putRoutine(routine: Routine) {
    this.db
      .prepare(
        "INSERT INTO routines VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(routine.id, routine.botId, JSON.stringify(routine));
  }
  /** Removes a routine and everything recorded about it. */
  deleteRoutine(id: string) {
    this.db
      .prepare(
        "DELETE FROM routine_steps WHERE run_id IN (SELECT id FROM routine_runs WHERE routine_id=?)",
      )
      .run(id);
    for (const table of [
      "routine_runs",
      "routine_state",
      "routine_notifications",
    ])
      this.db.prepare(`DELETE FROM ${table} WHERE routine_id=?`).run(id);
    this.db.prepare("DELETE FROM routines WHERE id=?").run(id);
  }
  // Runs
  run(id: string): RoutineRun | undefined {
    const row = this.db
      .prepare("SELECT data FROM routine_runs WHERE id=?")
      .get(id);
    return row ? (JSON.parse(row.data as string) as RoutineRun) : undefined;
  }
  runs(filter: { routineId?: string; states?: RunState[]; limit?: number }) {
    const where: string[] = [],
      args: string[] = [];
    if (filter.routineId) {
      where.push("routine_id=?");
      args.push(filter.routineId);
    }
    if (filter.states) {
      where.push(`state IN (${filter.states.map(() => "?").join(",")})`);
      args.push(...filter.states);
    }
    const sql = `SELECT data FROM routine_runs ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY due_at DESC, rowid DESC LIMIT ${Math.max(1, Math.min(filter.limit ?? 200, 1000))}`;
    return this.db
      .prepare(sql)
      .all(...args)
      .map((r) => JSON.parse(r.data as string) as RoutineRun);
  }
  /**
   * Inserts a run unless its occurrence was already claimed. Returns false on a
   * duplicate claim, which callers treat as "someone else has it".
   */
  claimRun(run: RoutineRun): boolean {
    const result = this.db
      .prepare("INSERT OR IGNORE INTO routine_runs VALUES(?,?,?,?,?,?)")
      .run(
        run.id,
        run.routineId,
        run.occurrenceKey,
        run.state,
        run.dueAt,
        JSON.stringify(run),
      );
    return result.changes === 1;
  }
  putRun(run: RoutineRun) {
    this.db
      .prepare("UPDATE routine_runs SET state=?, due_at=?, data=? WHERE id=?")
      .run(run.state, run.dueAt, JSON.stringify(run), run.id);
  }
  /** Runs whose first attempt started since `sinceIso`, scheduled and manual together. Retries and resumptions do not count again. */
  runsStartedSince(routineId: string, sinceIso: string) {
    return this.runs({ routineId, limit: 1000 }).filter(
      (r) => r.startedAt !== null && r.startedAt >= sinceIso,
    ).length;
  }
  // Checkpoints
  step(runId: string, key: string): RunStep | undefined {
    const row = this.db
      .prepare("SELECT data FROM routine_steps WHERE run_id=? AND key=?")
      .get(runId, key);
    return row ? (JSON.parse(row.data as string) as RunStep) : undefined;
  }
  steps(runId: string): RunStep[] {
    return this.db
      .prepare("SELECT data FROM routine_steps WHERE run_id=? ORDER BY rowid")
      .all(runId)
      .map((r) => JSON.parse(r.data as string) as RunStep);
  }
  putStep(step: RunStep) {
    this.db
      .prepare(
        "INSERT INTO routine_steps VALUES(?,?,?) ON CONFLICT(run_id,key) DO UPDATE SET data=excluded.data",
      )
      .run(step.runId, step.key, JSON.stringify(step));
  }
  // Watcher and notice state
  state(routineId: string): WatcherState {
    const row = this.db
      .prepare("SELECT data FROM routine_state WHERE routine_id=?")
      .get(routineId);
    return row
      ? (JSON.parse(row.data as string) as WatcherState)
      : {
          routineId,
          observed: null,
          observedAt: null,
          notified: null,
          notifiedAt: null,
          notifiedExcerpt: null,
          noticeKey: null,
        };
  }
  resetState(routineId: string) {
    this.db
      .prepare("DELETE FROM routine_state WHERE routine_id=?")
      .run(routineId);
  }
  putState(state: WatcherState) {
    this.db
      .prepare(
        "INSERT INTO routine_state VALUES(?,?) ON CONFLICT(routine_id) DO UPDATE SET data=excluded.data",
      )
      .run(state.routineId, JSON.stringify(state));
  }
  // Notifications
  /** Inserts once per dedupe key. Returns the stored notification. */
  notify(n: RoutineNotification): RoutineNotification {
    this.db
      .prepare("INSERT OR IGNORE INTO routine_notifications VALUES(?,?,?,?,?)")
      .run(n.id, n.routineId, n.dedupeKey, n.deliverAt, JSON.stringify(n));
    const row = this.db
      .prepare("SELECT data FROM routine_notifications WHERE dedupe_key=?")
      .get(n.dedupeKey)!;
    return JSON.parse(row.data as string) as RoutineNotification;
  }
  notification(id: string): RoutineNotification | undefined {
    const row = this.db
      .prepare("SELECT data FROM routine_notifications WHERE id=?")
      .get(id);
    return row
      ? (JSON.parse(row.data as string) as RoutineNotification)
      : undefined;
  }
  putNotification(n: RoutineNotification) {
    this.db
      .prepare(
        "UPDATE routine_notifications SET deliver_at=?, data=? WHERE id=?",
      )
      .run(n.deliverAt, JSON.stringify(n), n.id);
  }
  /** Delivered notifications (held ones excluded), newest first. */
  notifications(nowIso: string, routineId?: string, limit = 100) {
    return this.db
      .prepare(
        `SELECT data FROM routine_notifications WHERE deliver_at<=? ${routineId ? "AND routine_id=?" : ""} ORDER BY deliver_at DESC, rowid DESC LIMIT ${limit}`,
      )
      .all(...(routineId ? [nowIso, routineId] : [nowIso]))
      .map((r) => JSON.parse(r.data as string) as RoutineNotification);
  }
  allNotifications(routineId: string) {
    return this.db
      .prepare(
        "SELECT data FROM routine_notifications WHERE routine_id=? ORDER BY rowid",
      )
      .all(routineId)
      .map((r) => JSON.parse(r.data as string) as RoutineNotification);
  }
  // Ownership lease
  lease(): { owner: string; fence: number; expiresAt: number } | undefined {
    const row = this.db
      .prepare("SELECT owner, fence, expires_at FROM runtime_lease WHERE id=1")
      .get();
    return row
      ? {
          owner: row.owner as string,
          fence: row.fence as number,
          expiresAt: row.expires_at as number,
        }
      : undefined;
  }
  /**
   * Takes or renews the lease. An unexpired lease of the same owner is
   * renewed with the same fence; any other acquisition increments the fence,
   * so work started under an earlier fence can no longer commit.
   */
  acquire(
    owner: string,
    now: number,
    ttlMs: number,
    ownerGone: (owner: string) => boolean,
  ): number | null {
    return this.store.transaction(() => {
      const current = this.lease();
      if (current && current.owner === owner && current.expiresAt > now) {
        this.db
          .prepare("UPDATE runtime_lease SET expires_at=? WHERE id=1")
          .run(now + ttlMs);
        return current.fence;
      }
      if (
        current &&
        current.owner !== owner &&
        current.expiresAt > now &&
        !ownerGone(current.owner)
      )
        return null;
      const fence = (current?.fence ?? 0) + 1;
      this.db
        .prepare(
          "INSERT INTO runtime_lease VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner, fence=excluded.fence, expires_at=excluded.expires_at",
        )
        .run(owner, fence, now + ttlMs);
      return fence;
    });
  }
  /** Throws unless `owner` still holds `fence`. Call inside the committing transaction. */
  assertFence(owner: string, fence: number, now: number) {
    const current = this.lease();
    if (
      !current ||
      current.owner !== owner ||
      current.fence !== fence ||
      current.expiresAt <= now
    )
      throw new FencedError();
  }
  release(owner: string) {
    this.db
      .prepare("UPDATE runtime_lease SET expires_at=0 WHERE id=1 AND owner=?")
      .run(owner);
  }
  /** Retention: terminal runs older than 90 days or beyond 200 per routine; old checkpoints; read notifications after 30 days. */
  prune(now: number) {
    const day = 86_400_000;
    const old = new Date(now - 90 * day).toISOString();
    const terminal = `state NOT IN ('queued','running','awaiting-approval')`;
    this.db
      .prepare(
        `DELETE FROM routine_runs WHERE ${terminal} AND (due_at < ? OR id IN (
          SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY routine_id ORDER BY due_at DESC) AS n FROM routine_runs WHERE ${terminal}) WHERE n > 200))`,
      )
      .run(old);
    // Checkpoints only serve resumption; terminal runs keep them for 7 days for inspection.
    this.db
      .prepare(
        `DELETE FROM routine_steps WHERE run_id NOT IN (SELECT id FROM routine_runs) OR run_id IN (SELECT id FROM routine_runs WHERE ${terminal} AND due_at < ?)`,
      )
      .run(new Date(now - 7 * day).toISOString());
    const readOld = new Date(now - 30 * day).toISOString();
    for (const row of this.db
      .prepare(
        "SELECT id, data FROM routine_notifications WHERE deliver_at < ?",
      )
      .all(readOld))
      if ((JSON.parse(row.data as string) as RoutineNotification).read)
        this.db
          .prepare("DELETE FROM routine_notifications WHERE id=?")
          .run(row.id as string);
  }
}
