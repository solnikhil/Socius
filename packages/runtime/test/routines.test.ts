import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BotInstance } from "@socius/contracts";
import type { ActionRecord, Task } from "@socius/contracts/app";
import type { Routine, RoutineRun } from "@socius/contracts/routines";
import { Store } from "../src/store.js";
import type { ActionBroker } from "../src/broker.js";
import { ProviderFailure } from "../src/providers/errors.js";
import {
  RoutineEngine,
  SimulatedCrash,
  type GenerateInput,
  type RoutineEngineOptions,
  type RoutineHost,
} from "../src/routines/engine.js";
import { RoutineRecords } from "../src/routines/records.js";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const PAGE = "11111111-1111-1111-1111-111111111111";

/** One controllable clock shared by every engine in a test. */
function clock(start = "2026-10-14T00:00:00Z") {
  let now = Date.parse(start);
  return {
    now: () => now,
    set: (iso: string) => void (now = Date.parse(iso)),
    advance: (ms: number) => void (now += ms),
  };
}
type Clock = ReturnType<typeof clock>;
interface Fake {
  generate: (input: GenerateInput) => Promise<string>;
  read: () => Promise<{ summary: string; data: string | null }>;
  model: () => Promise<{ connectionId: string; modelId: string }>;
  busy: boolean;
  calls: GenerateInput[];
  blocked: string[];
}
function fakeHost(): Fake {
  const fake: Fake = {
    generate: async () => "Here is your plan.",
    read: async () => ({
      summary: "Read Notion page.",
      data: "# Plan\nShip it.",
    }),
    model: async () => ({
      connectionId: "00000000-0000-4000-8000-000000000000",
      modelId: "fixture",
    }),
    busy: false,
    calls: [],
    blocked: [],
  };
  return fake;
}
function open(
  dir: string,
  c: Clock,
  fake: Fake,
  options: RoutineEngineOptions = {},
) {
  const store = new Store(dir);
  const host: RoutineHost = {
    model: () => fake.model(),
    generate: (input) => {
      fake.calls.push(input);
      return fake.generate(input);
    },
    read: () => fake.read(),
    foregroundBusy: () => fake.busy,
    foregroundActive: () => fake.busy,
  };
  // The engine only needs the broker's guard and pending-block hooks here;
  // runtime-level tests exercise the real broker.
  const broker = {
    setActorGuard: () => undefined,
    blockPending: (_: unknown, reason: string) =>
      void fake.blocked.push(reason),
  } as unknown as ActionBroker;
  const engine = new RoutineEngine(store, host, broker, {
    now: c.now,
    autoStart: false,
    backoffMs: MIN,
    ...options,
  });
  const bot = store.all<BotInstance>("bot")[0]!;
  /** Ticks, waits for started runs, then ticks again to settle. */
  const cycle = async () => {
    await engine.tick();
    await engine.idle();
    await engine.tick();
    await engine.idle();
  };
  return { store, engine, bot, cycle, records: new RoutineRecords(store) };
}
type Opened = ReturnType<typeof open>;
async function withDir(name: string, fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), `socius-${name}-`));
  try {
    await fn(dir);
  } finally {
    // Best effort: on Windows an abandoned (crashed) database can stay locked briefly.
    await rm(dir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    }).catch(() => undefined);
  }
}
function routine(o: Opened, extra: Record<string, unknown> = {}): Routine {
  return o.engine.create({
    botId: o.bot.id,
    name: "Morning brief",
    work: { kind: "task", prompt: "Draft my week" },
    schedule: { kind: "daily", time: "08:00" },
    timezone: "Asia/Kolkata",
    ...extra,
  });
}
const runs = (o: Opened, id: string) => o.engine.history(id).runs;
/** Waits until a started run reaches `state` (runs start asynchronously after a tick). */
async function until(o: Opened, id: string, state: string) {
  for (let i = 0; i < 200 && runs(o, id)[0]?.state !== state; i++)
    await new Promise((r) => setTimeout(r, 5));
  assert.equal(runs(o, id)[0]?.state, state);
}
const delivered = (o: Opened, id: string) => o.engine.history(id).notifications;
const close = async (o: Opened) => {
  await o.engine.stop();
  o.store.close();
};
/** Abandons an engine as a crash would: no shutdown writes, lease left in place. */
const abandon = (o: Opened) => o.store.close();

test("new routines stay disabled until explicitly enabled; enabling grants nothing", () =>
  withDir("routine-disabled", async (dir) => {
    const c = clock("2026-10-14T00:00:00Z");
    const fake = fakeHost();
    const o = open(dir, c, fake);
    const grants = [...o.bot.grantedCapabilities];
    const r = routine(o);
    assert.equal(r.enabled, false);
    assert.equal(r.next?.key, "2026-10-14T08:00");
    const preview = o.engine.preview({ id: r.id });
    assert.equal(preview.occurrences[0]!.at, "2026-10-14T02:30:00.000Z");
    assert.ok(preview.notes.some((n) => n.startsWith("Off:")));
    // Due while disabled: nothing runs and nothing is recorded as missed.
    c.set("2026-10-14T02:31:00Z");
    await o.cycle();
    assert.equal(runs(o, r.id).length, 0);
    assert.equal(fake.calls.length, 0);
    // Editing never enables.
    assert.equal(o.engine.edit(r.id, { name: "Week plan" }).enabled, false);
    const enabled = o.engine.setEnabled(r.id, true);
    assert.equal(enabled.enabled, true);
    assert.equal(enabled.next?.key, "2026-10-15T08:00");
    assert.deepEqual(
      o.store.get<BotInstance>("bot", o.bot.id)!.grantedCapabilities,
      grants,
    );
    await close(o);
  }));

test("an on-time occurrence runs once, records history and delivers one result", () =>
  withDir("routine-ontime", async (dir) => {
    const c = clock("2026-10-14T00:00:00Z");
    const fake = fakeHost();
    const o = open(dir, c, fake);
    const r = o.engine.setEnabled(routine(o).id, true);
    c.set("2026-10-14T02:29:59Z");
    await o.cycle();
    assert.equal(runs(o, r.id).length, 0, "not due yet");
    c.set("2026-10-14T02:31:00Z");
    await o.cycle();
    // Duplicate ticks and a later tick in the same window do not claim it again.
    await o.cycle();
    c.advance(10 * MIN);
    await o.cycle();
    const [run] = runs(o, r.id);
    assert.equal(runs(o, r.id).length, 1);
    assert.equal(run!.state, "completed");
    assert.equal(run!.occurrenceKey, "2026-10-14T08:00");
    assert.equal(run!.trigger, "schedule");
    assert.equal(run!.scheduledAt, "2026-10-14T02:30:00.000Z");
    assert.equal(run!.attempts.length, 1);
    assert.equal(run!.revision, r.revision);
    assert.deepEqual(run!.model, {
      connectionId: "00000000-0000-4000-8000-000000000000",
      modelId: "fixture",
    });
    assert.equal(
      o.store.get<Task>("task", run!.attempts[0]!.taskId)!.routineRunId,
      run!.id,
    );
    assert.equal(fake.calls.length, 1);
    assert.match(fake.calls[0]!.briefing, /scheduled run of the routine/);
    assert.equal(fake.calls[0]!.runRef, `routine:${run!.id}`);
    const notes = delivered(o, r.id);
    assert.equal(notes.length, 1);
    assert.equal(notes[0]!.body, "Here is your plan.");
    assert.equal(o.engine.history(r.id).runs[0]!.notificationId, notes[0]!.id);
    assert.equal(o.records.routine(r.id)!.next?.key, "2026-10-15T08:00");
    await close(o);
  }));

test("missed runs: skip records one coalesced skip; run-once runs one bounded catch-up", () =>
  withDir("routine-missed", async (dir) => {
    const c = clock("2026-10-14T00:00:00Z");
    const fake = fakeHost();
    const o = open(dir, c, fake);
    const skip = o.engine.setEnabled(routine(o, { name: "Skip" }).id, true);
    const catchUp = o.engine.setEnabled(
      routine(o, {
        name: "Catch up",
        missedRuns: { policy: "run-once", maxDelayMinutes: 180 },
      }).id,
      true,
    );
    const tooOld = o.engine.setEnabled(
      routine(o, {
        name: "Too old",
        missedRuns: { policy: "run-once", maxDelayMinutes: 60 },
      }).id,
      true,
    );
    // Laptop asleep for three days; it wakes two hours after the third 08:00.
    c.set("2026-10-16T04:30:00Z");
    await o.cycle();
    const [skipped] = runs(o, skip.id);
    assert.equal(runs(o, skip.id).length, 1);
    assert.equal(skipped!.state, "skipped");
    assert.deepEqual(skipped!.covers, {
      count: 3,
      firstAt: "2026-10-14T02:30:00.000Z",
      lastAt: "2026-10-16T02:30:00.000Z",
    });
    assert.match(skipped!.reason!, /Missed 3 occurrences/);
    const [caught] = runs(o, catchUp.id);
    assert.equal(runs(o, catchUp.id).length, 1, "coalesced, not flooded");
    assert.equal(caught!.trigger, "catch-up");
    assert.equal(caught!.state, "completed");
    assert.equal(caught!.covers!.count, 3);
    assert.equal(runs(o, tooOld.id)[0]!.state, "skipped");
    assert.match(runs(o, tooOld.id)[0]!.reason!, /catch-up limit/);
    assert.equal(fake.calls.length, 1, "only the catch-up ran a model");
    await close(o);
  }));

test("an on-time occurrence after missed ones runs, and the missed ones are recorded", () =>
  withDir("routine-ontime-missed", async (dir) => {
    const c = clock("2026-10-14T00:00:00Z");
    const fake = fakeHost();
    const o = open(dir, c, fake);
    const r = o.engine.setEnabled(routine(o).id, true);
    c.set("2026-10-16T02:31:00Z");
    await o.cycle();
    const list = runs(o, r.id);
    assert.deepEqual(
      list.map((x) => [x.occurrenceKey, x.state]),
      [
        ["2026-10-16T08:00", "completed"],
        ["2026-10-15T08:00", "skipped"],
      ],
    );
    assert.equal(list[1]!.covers!.count, 2);
    await close(o);
  }));

test("time-zone edits and a clock moved backwards never re-run a wall-clock occurrence", () =>
  withDir("routine-zone", async (dir) => {
    const c = clock("2026-10-14T00:00:00Z");
    const fake = fakeHost();
    const o = open(dir, c, fake);
    const r = o.engine.setEnabled(routine(o).id, true);
    c.set("2026-10-14T02:31:00Z"); // 08:01 in Kolkata
    await o.cycle();
    // Move to London, where 08:00 on the same local date is still ahead.
    const edited = o.engine.edit(r.id, { timezone: "Europe/London" });
    assert.equal(edited.revision, 2);
    assert.equal(edited.enabled, true);
    c.set("2026-10-14T07:01:00Z"); // 08:01 in London
    await o.cycle();
    assert.equal(
      runs(o, r.id).filter((x) => x.state === "completed").length,
      1,
    );
    // The clock jumps back two hours: recorded occurrences are not repeated.
    c.set("2026-10-14T05:00:00Z");
    await o.cycle();
    c.set("2026-10-14T07:02:00Z");
    await o.cycle();
    assert.equal(
      runs(o, r.id).filter((x) => x.state === "completed").length,
      1,
    );
    assert.equal(fake.calls.length, 1);
    assert.ok(
      o.store
        .all<{ kind: string }>("activity")
        .some((a) => a.kind === "routine.clock"),
    );
    // The next London occurrence runs normally.
    c.set("2026-10-15T07:01:00Z");
    await o.cycle();
    assert.equal(runs(o, r.id)[0]!.occurrenceKey, "2026-10-15T08:00");
    assert.equal(fake.calls.length, 2);
    await close(o);
  }));

test("overlapping occurrences are skipped and foreground chat goes first", () =>
  withDir("routine-overlap", async (dir) => {
    const c = clock("2026-10-14T00:00:00Z");
    const fake = fakeHost();
    // Ticks are driven by hand here, so keep the lease from lapsing between them.
    const o = open(dir, c, fake, { leaseTtlMs: DAY });
    let release!: () => void;
    fake.generate = () =>
      new Promise((resolve) => (release = () => resolve("done")));
    const r = o.engine.setEnabled(
      routine(o, {
        schedule: {
          kind: "interval",
          everyMinutes: 15,
          anchor: "2026-10-14T00:15:00.000Z",
        },
      }).id,
      true,
    );
    // Foreground work for this bot: the due run waits in the queue.
    fake.busy = true;
    c.set("2026-10-14T00:15:30Z");
    await o.engine.tick();
    assert.equal(runs(o, r.id)[0]!.state, "queued");
    fake.busy = false;
    await o.engine.tick();
    await until(o, r.id, "running");
    // The next occurrence arrives while the first is still running.
    c.set("2026-10-14T00:30:30Z");
    await o.engine.tick();
    const list = runs(o, r.id);
    assert.equal(list[0]!.state, "skipped");
    assert.match(list[0]!.reason!, /still in progress/);
    release();
    await o.engine.idle();
    assert.equal(runs(o, r.id)[1]!.state, "completed");
    await close(o);
  }));

test("a lease that lapses during sleep never lets a hung call stall scheduling", () =>
  withDir("routine-sleep", async (dir) => {
    const c = clock();
    const fake = fakeHost();
    const o = open(dir, c, fake);
    // The first call hangs and ignores cancellation; the retry answers.
    fake.generate = () =>
      fake.calls.length === 1
        ? new Promise(() => undefined)
        : Promise.resolve("after sleep");
    const r = routine(o);
    o.engine.runNow(r.id);
    await o.engine.tick();
    await until(o, r.id, "running");
    // The laptop sleeps for ten minutes: the lease lapses and a new epoch starts.
    c.advance(10 * MIN);
    await o.engine.tick();
    assert.equal(o.engine.snapshot().scheduler.fence, 2);
    for (let i = 0; i < 200 && runs(o, r.id)[0]!.state !== "completed"; i++)
      await new Promise((t) => setTimeout(t, 5));
    const [run] = runs(o, r.id);
    assert.equal(run!.state, "completed");
    assert.equal(run!.result, "after sleep");
    assert.deepEqual(
      run!.attempts.map((a) => a.outcome),
      ["interrupted", "completed"],
    );
    o.store.close();
  }));

test("manual run-now works on a disabled routine and obeys the daily budget", () =>
  withDir("routine-manual", async (dir) => {
    const c = clock();
    const fake = fakeHost();
    const o = open(dir, c, fake);
    const r = routine(o, { limits: { maxRunsPerDay: 2 } });
    for (let i = 0; i < 2; i++) {
      const run = o.engine.runNow(r.id);
      assert.equal(run.trigger, "manual");
      assert.equal(run.occurrenceKey, null);
      await o.cycle();
    }
    assert.throws(() => o.engine.runNow(r.id), /runs-per-day limit/);
    c.advance(DAY + MIN);
    o.engine.runNow(r.id);
    await o.cycle();
    assert.equal(
      runs(o, r.id).filter((x) => x.state === "completed").length,
      3,
    );
    await close(o);
  }));

test("crash before a step's checkpoint recomputes it; crash after reuses it; delivery happens once", () =>
  withDir("routine-crash", async (dir) => {
    const c = clock("2026-10-14T00:00:00Z");
    for (const point of [
      "step:model:computed",
      "before-complete",
      "after-complete",
    ]) {
      const fake = fakeHost();
      let crash = true;
      const a = open(dir, c, fake, {
        owner: `a-${point}`,
        faults: (p) => {
          if (crash && p === point) throw new SimulatedCrash(p);
        },
      });
      const r = a.engine.setEnabled(routine(a, { name: point }).id, true);
      // Just after the next 08:00 in Kolkata (02:30 UTC), within the grace period.
      const due = Date.parse(r.next!.at);
      c.set(new Date(due + MIN).toISOString());
      await a.cycle();
      assert.ok(a.engine.hasCrashed, point);
      abandon(a);
      // A new runtime process: the old lease must expire before it may take over.
      crash = false;
      const b = open(dir, c, fake, { owner: `b-${point}` });
      await b.cycle();
      assert.equal(b.engine.snapshot().scheduler.state, "standby");
      c.advance(2 * MIN);
      await b.cycle();
      const [run] = runs(b, r.id).filter((x) => x.trigger !== "manual");
      assert.equal(run!.state, "completed", point);
      assert.equal(
        delivered(b, r.id).length,
        1,
        `${point}: exactly one delivery`,
      );
      const expected = point === "step:model:computed" ? 2 : 1;
      assert.equal(fake.calls.length, expected, `${point}: model calls`);
      assert.equal(
        run!.attempts.length,
        point === "after-complete" ? 1 : 2,
        point,
      );
      if (point !== "after-complete")
        assert.equal(run!.attempts[0]!.outcome, "interrupted");
      // The interrupted attempt's chat task was marked failed on restart, not left running.
      assert.ok(
        run!.attempts.every(
          (at) => b.store.get<Task>("task", at.taskId)!.state !== "running",
        ),
      );
      await b.engine.setEnabled(r.id, false);
      await close(b);
    }
  }));

test("an interrupted run without attempts left stops instead of replaying", () =>
  withDir("routine-no-attempts", async (dir) => {
    const c = clock();
    const fake = fakeHost();
    let crash = true;
    const a = open(dir, c, fake, {
      owner: "a",
      faults: (p) => {
        if (crash && p === "attempt-started") throw new SimulatedCrash(p);
      },
    });
    const r = routine(a, { limits: { maxAttempts: 1 } });
    a.engine.runNow(r.id);
    await a.cycle();
    abandon(a);
    crash = false;
    c.advance(2 * MIN);
    const b = open(dir, c, fake, { owner: "b" });
    await b.cycle();
    const [run] = runs(b, r.id);
    assert.equal(run!.state, "interrupted");
    assert.match(run!.reason!, /nothing was replayed/);
    assert.equal(fake.calls.length, 0);
    await close(b);
  }));

test("an edit while the runtime was down invalidates the interrupted run", () =>
  withDir("routine-invalidate", async (dir) => {
    const c = clock();
    const fake = fakeHost();
    let crash = true;
    const a = open(dir, c, fake, {
      owner: "a",
      faults: (p) => {
        if (crash && p === "step:model:started") throw new SimulatedCrash(p);
      },
    });
    const r = routine(a);
    a.engine.runNow(r.id);
    await a.cycle();
    abandon(a);
    crash = false;
    c.advance(2 * MIN);
    const b = open(dir, c, fake, { owner: "b" });
    b.engine.edit(r.id, { work: { kind: "task", prompt: "Something else" } });
    await b.cycle();
    assert.equal(runs(b, r.id)[0]!.state, "cancelled");
    assert.equal(fake.calls.length, 0);
    await close(b);
  }));

test("fencing: a stale worker cannot commit after another runtime takes ownership", () =>
  withDir("routine-fence", async (dir) => {
    const c = clock();
    const fakeA = fakeHost();
    let releaseA!: (text: string) => void;
    fakeA.generate = () => new Promise((resolve) => (releaseA = resolve));
    const a = open(dir, c, fakeA, { owner: "a" });
    const r = routine(a);
    a.engine.runNow(r.id);
    await a.engine.tick(); // a owns fence 1 and starts the run
    assert.equal(a.engine.snapshot().scheduler.fence, 1);
    const fakeB = fakeHost();
    fakeB.generate = async () => "from b";
    const b = open(dir, c, fakeB, { owner: "b" });
    await b.engine.tick();
    assert.equal(
      b.engine.snapshot().scheduler.state,
      "standby",
      "a's lease is still valid",
    );
    // a stalls (e.g. the process is suspended) beyond its lease; b takes over.
    c.advance(2 * MIN);
    await b.cycle();
    assert.equal(b.engine.snapshot().scheduler.fence, 2);
    let [run] = runs(b, r.id);
    assert.equal(run!.state, "completed");
    assert.equal(run!.result, "from b");
    // a wakes and finishes its model call: the commit is fenced and discarded.
    releaseA("from a");
    await a.engine.idle();
    [run] = runs(b, r.id);
    assert.equal(run!.result, "from b");
    assert.equal(delivered(b, r.id).length, 1);
    assert.deepEqual(
      run!.attempts.map((x) => [x.fence, x.outcome]),
      [
        [1, "interrupted"],
        [2, "completed"],
      ],
    );
    // a's next tick sees it no longer owns execution.
    await a.engine.tick();
    assert.equal(a.engine.snapshot().scheduler.state, "standby");
    await close(b);
    abandon(a);
  }));

test("cancellation stops a running attempt and a late completion never reports success", () =>
  withDir("routine-cancel", async (dir) => {
    const c = clock();
    const fake = fakeHost();
    let finish!: () => void;
    // The model call ignores the abort signal and returns late.
    fake.generate = () =>
      new Promise((resolve) => (finish = () => resolve("late result")));
    const o = open(dir, c, fake);
    const r = routine(o);
    o.engine.runNow(r.id);
    await o.engine.tick();
    await until(o, r.id, "running");
    const running = runs(o, r.id)[0]!;
    assert.ok(!fake.calls[0]!.signal.aborted);
    o.engine.cancelRun(running.id);
    assert.ok(
      fake.calls[0]!.signal.aborted,
      "the abort reaches the active step",
    );
    assert.equal(
      fake.blocked.length,
      1,
      "pending proposals of the run are blocked",
    );
    finish();
    await o.engine.idle();
    await o.cycle();
    const [run] = runs(o, r.id);
    assert.equal(run!.state, "cancelled");
    assert.equal(run!.result, null);
    assert.equal(delivered(o, r.id).length, 0);
    assert.equal(
      o.store.get<Task>("task", run!.attempts[0]!.taskId)!.state,
      "cancelled",
    );
    // A queued run that is cancelled never starts.
    const queued = o.engine.runNow(r.id);
    o.engine.cancelRun(queued.id);
    await o.cycle();
    assert.equal(fake.calls.length, 1);
    await close(o);
  }));

test("transient failures retry with backoff; setup problems block once and stay quiet", () =>
  withDir("routine-failures", async (dir) => {
    const c = clock();
    const fake = fakeHost();
    let failures = 1;
    fake.generate = async () => {
      if (failures-- > 0)
        throw new ProviderFailure(
          "rate_limited",
          "Rate limited. Wait and try again.",
        );
      return "recovered";
    };
    const o = open(dir, c, fake);
    const r = routine(o);
    o.engine.runNow(r.id);
    await o.cycle();
    let [run] = runs(o, r.id);
    assert.equal(run!.state, "queued");
    assert.equal(run!.dueAt, new Date(c.now() + MIN).toISOString());
    c.advance(MIN);
    await o.cycle();
    [run] = runs(o, r.id);
    assert.equal(run!.state, "completed");
    assert.equal(run!.attempts.length, 2);

    fake.model = async () => {
      throw new Error("Choose a model in Settings → Models first");
    };
    for (let i = 0; i < 3; i++) {
      c.advance(MIN);
      o.engine.runNow(r.id);
      await o.cycle();
    }
    const blocked = runs(o, r.id).filter((x) => x.state === "blocked");
    assert.equal(blocked.length, 3, "every block stays visible in history");
    const notices = delivered(o, r.id).filter((n) => n.kind === "setup-needed");
    assert.equal(notices.length, 1, "repeated setup notices are suppressed");
    await close(o);
  }));

test("watchers stay quiet while unchanged and deliver one update per meaningful change", () =>
  withDir("routine-watch", async (dir) => {
    const c = clock("2026-10-14T06:00:00Z");
    const fake = fakeHost();
    let content: string | null = "# Plan\nShip connectors.";
    let failing = false;
    fake.read = async () => {
      if (failing)
        throw Object.assign(new Error("Could not reach Notion."), {
          status: 502,
        });
      return {
        summary:
          "Read Notion page https://www.notion.so/plan, see https://www.notion.so/notes.",
        data: content,
      };
    };
    const o = open(dir, c, fake);
    const w = o.engine.setEnabled(
      routine(o, {
        name: "Plan watcher",
        work: {
          kind: "watcher",
          source: { action: "notion.fetch", arguments: { page: PAGE } },
        },
        schedule: {
          kind: "interval",
          everyMinutes: 30,
          anchor: "2026-10-14T06:30:00.000Z",
        },
        timezone: "UTC",
        notifications: { cooldownMinutes: 120 },
        limits: { maxAttempts: 1, maxRunsPerDay: 96 },
      }).id,
      true,
    );
    const step = async () => {
      c.advance(30 * MIN);
      await o.cycle();
    };
    await step(); // baseline
    await step(); // unchanged
    await step(); // unchanged
    assert.equal(
      delivered(o, w.id).length,
      0,
      "baseline and unchanged checks are quiet",
    );
    assert.deepEqual(
      runs(o, w.id).map((r) => r.result),
      [
        "No change.",
        "No change.",
        "Started watching. The first observation is the baseline.",
      ],
    );
    assert.equal(
      fake.calls.length,
      0,
      "watchers without a prompt never call a model",
    );

    content = "# Plan\nShip connectors. Launch moved to Friday.";
    await step();
    let notes = delivered(o, w.id);
    assert.equal(notes.length, 1);
    assert.equal(notes[0]!.kind, "change");
    // Sentence punctuation after a URL is not part of the link.
    assert.deepEqual(notes[0]!.links, [
      "https://www.notion.so/plan",
      "https://www.notion.so/notes",
    ]);
    assert.ok(notes[0]!.observedAt);
    await step(); // unchanged after the update
    assert.equal(delivered(o, w.id).length, 1);

    // Two quick changes inside the cooldown coalesce into one later update.
    content = "# Plan\nLaunch moved to Monday.";
    await step();
    content = "# Plan\nLaunch moved to Tuesday.";
    await step();
    assert.equal(delivered(o, w.id).length, 1, "held by the cooldown");
    await step();
    notes = delivered(o, w.id);
    assert.equal(notes.length, 2);

    // Failures are not observations: the baseline stays and the notice is sent once.
    const before = o.records.state(w.id).notified;
    failing = true;
    await step();
    await step();
    assert.equal(o.records.state(w.id).notified, before);
    const failed = runs(o, w.id).filter((r) => r.state === "failed");
    assert.equal(failed.length, 2);
    assert.equal(
      delivered(o, w.id).filter((n) => n.kind === "failure").length,
      1,
    );
    // A partial result (no body) is a failure too, never "empty".
    failing = false;
    content = null;
    await step();
    assert.equal(runs(o, w.id)[0]!.state, "failed");
    assert.match(runs(o, w.id)[0]!.reason!, /returned no content/);
    assert.equal(o.records.state(w.id).notified, before);
    // Recovery clears the suppressed notice; the content is the same, so it stays quiet.
    content = "# Plan\nLaunch moved to Tuesday.";
    await step();
    assert.equal(runs(o, w.id)[0]!.result, "No change.");
    assert.equal(o.records.state(w.id).noticeKey, null);
    // Two changes plus one notice per distinct failure (unreachable, then partial).
    assert.deepEqual(
      delivered(o, w.id)
        .map((n) => n.kind)
        .sort(),
      ["change", "change", "failure", "failure"],
    );
    await close(o);
  }));

test("watcher judgement, quiet hours, snooze and mute control delivery", () =>
  withDir("routine-quiet", async (dir) => {
    const c = clock("2026-10-14T20:00:00Z");
    const fake = fakeHost();
    let content = "v1";
    let verdict = "NO_MEANINGFUL_CHANGE";
    fake.read = async () => ({ summary: "Read.", data: content });
    fake.generate = async () => verdict;
    const o = open(dir, c, fake);
    const w = o.engine.setEnabled(
      routine(o, {
        name: "Judge",
        work: {
          kind: "watcher",
          source: { action: "notion.fetch", arguments: { page: PAGE } },
          prompt: "Tell me if the launch date changes.",
        },
        schedule: {
          kind: "interval",
          everyMinutes: 60,
          anchor: "2026-10-14T21:00:00.000Z",
        },
        timezone: "UTC",
        notifications: { quietHours: { start: "22:00", end: "07:00" } },
        limits: { maxRunsPerDay: 96 },
      }).id,
      true,
    );
    const step = async () => {
      c.advance(HOUR);
      await o.cycle();
    };
    await step(); // 21:00 baseline
    content = "v2 (typo fix)";
    await step(); // 22:00 judged not meaningful
    assert.equal(fake.calls.length, 1);
    assert.match(fake.calls[0]!.prompt, /<previous>\nv1\n<\/previous>/);
    assert.equal(
      runs(o, w.id)[0]!.reason,
      "The bot judged the change not meaningful.",
    );
    await step(); // 23:00: same content, no second judgement
    assert.equal(fake.calls.length, 1);
    content = "v3 launch moved";
    verdict = "The launch moved to Friday.";
    await step(); // 00:00, inside quiet hours
    const held = o.records.allNotifications(w.id);
    assert.equal(held.length, 1);
    assert.equal(held[0]!.deliverAt, "2026-10-15T07:00:00.000Z");
    assert.equal(
      o.engine.snapshot().notifications.length,
      0,
      "held notifications are not shown yet",
    );
    c.set("2026-10-15T07:00:00Z");
    assert.equal(o.engine.snapshot().notifications.length, 1);
    // Snooze holds, mute records history only.
    o.engine.snooze(w.id, "2026-10-15T12:00:00.000Z");
    content = "v4";
    verdict = "Launch moved again.";
    await o.cycle();
    c.set("2026-10-15T08:00:30Z");
    await o.cycle();
    assert.equal(
      o.records.allNotifications(w.id).at(-1)!.deliverAt,
      "2026-10-15T12:00:00.000Z",
    );
    o.engine.snooze(w.id, null);
    o.engine.mute(w.id, true);
    content = "v5";
    c.set("2026-10-15T09:00:30Z");
    await o.cycle();
    assert.equal(o.records.allNotifications(w.id).length, 2);
    assert.equal(runs(o, w.id)[0]!.state, "completed");
    await close(o);
  }));

test("watcher crash between observation and delivery recovers without duplicate updates", () =>
  withDir("routine-watch-crash", async (dir) => {
    const c = clock("2026-10-14T00:00:00Z");
    for (const point of [
      "step:observe:computed",
      "before-complete",
      "after-complete",
    ]) {
      const fake = fakeHost();
      let content = "first";
      fake.read = async () => ({ summary: "Read.", data: content });
      const a = open(dir, c, fake, { owner: `a-${point}` });
      const w = a.engine.setEnabled(
        routine(a, {
          name: point,
          work: {
            kind: "watcher",
            source: { action: "notion.fetch", arguments: { page: PAGE } },
          },
        }).id,
        true,
      );
      a.engine.runNow(w.id);
      await a.cycle(); // baseline
      await close(a);
      content = "second";
      let crash = true;
      const b = open(dir, c, fake, {
        owner: `b-${point}`,
        faults: (p) => {
          if (crash && p === point) throw new SimulatedCrash(p);
        },
      });
      c.advance(MIN);
      b.engine.runNow(w.id);
      await b.cycle();
      abandon(b);
      crash = false;
      c.advance(2 * MIN);
      const d = open(dir, c, fake, { owner: `d-${point}` });
      await d.cycle();
      const changes = d.records
        .allNotifications(w.id)
        .filter((n) => n.kind === "change");
      assert.equal(changes.length, 1, point);
      assert.equal(
        d.records.state(w.id).notified,
        d.engine.history(w.id).runs[0]!.state === "completed"
          ? d.records.state(w.id).observed
          : null,
      );
      // Running again with unchanged content stays quiet.
      c.advance(MIN);
      d.engine.runNow(w.id);
      await d.cycle();
      assert.equal(
        d.records.allNotifications(w.id).filter((n) => n.kind === "change")
          .length,
        1,
        point,
      );
      d.engine.setEnabled(w.id, false);
      await close(d);
    }
  }));

test("briefs skip empty content unless asked; goals are finite and stop after restart", () =>
  withDir("routine-goals", async (dir) => {
    const c = clock("2026-10-14T00:00:00Z");
    const fake = fakeHost();
    fake.generate = async (input) =>
      input.briefing.includes("NOTHING_TO_REPORT")
        ? "NOTHING_TO_REPORT"
        : "Progress: 2 of 5 chapters.";
    let o = open(dir, c, fake);
    const quiet = routine(o, {
      work: { kind: "brief", prompt: "Morning brief" },
    });
    const loud = routine(o, {
      work: { kind: "brief", prompt: "Morning brief", deliverEmpty: true },
    });
    o.engine.runNow(quiet.id);
    o.engine.runNow(loud.id);
    await o.cycle();
    assert.equal(delivered(o, quiet.id).length, 0);
    assert.equal(
      runs(o, quiet.id)[0]!.reason,
      "The brief was empty, so nothing was delivered.",
    );
    assert.equal(delivered(o, loud.id)[0]!.body, "Nothing to report.");

    const goal = o.engine.setEnabled(
      routine(o, {
        name: "Thesis",
        work: {
          kind: "goal",
          prompt: "Check on my thesis",
          until: "2026-10-30",
          maxFollowUps: 2,
        },
      }).id,
      true,
    );
    for (const day of ["2026-10-14", "2026-10-15", "2026-10-16"]) {
      c.set(`${day}T02:31:00Z`);
      await o.cycle();
    }
    const followUps = runs(o, goal.id).filter((r) => r.state === "completed");
    assert.equal(followUps.length, 2, "bounded by maxFollowUps");
    assert.ok(o.records.routine(goal.id)!.finishedAt);
    assert.equal(
      o.records.routine(goal.id)!.finishedReason,
      "All follow-ups were used.",
    );

    // A goal stopped by the user never runs again, including after a restart.
    const second = o.engine.setEnabled(
      routine(o, {
        name: "Gym",
        work: { kind: "goal", prompt: "Gym check-in", until: "2026-11-30" },
      }).id,
      true,
    );
    o.engine.finish(second.id);
    await close(o);
    o = open(dir, c, fake);
    for (const day of ["2026-10-17", "2026-10-18"]) {
      c.set(`${day}T02:31:00Z`);
      await o.cycle();
    }
    assert.equal(runs(o, second.id).length, 0);
    assert.throws(() => o.engine.setEnabled(second.id, true), /finished/);

    // The bot can report completion, which also stops follow-ups.
    fake.generate = async () => "GOAL_COMPLETE\nYou submitted the thesis.";
    const third = o.engine.setEnabled(
      routine(o, {
        name: "Submit",
        work: { kind: "goal", prompt: "Did I submit?", until: "2026-11-30" },
      }).id,
      true,
    );
    c.set("2026-10-19T02:31:00Z");
    await o.cycle();
    assert.equal(delivered(o, third.id)[0]!.kind, "finished");
    assert.equal(delivered(o, third.id)[0]!.body, "You submitted the thesis.");
    c.set("2026-10-20T02:31:00Z");
    await o.cycle();
    assert.equal(runs(o, third.id).length, 1);
    await close(o);
  }));

test("deleting a routine or its bot removes history and cancels queued work", () =>
  withDir("routine-delete", async (dir) => {
    const c = clock();
    const fake = fakeHost();
    const o = open(dir, c, fake);
    const r = routine(o);
    o.engine.runNow(r.id);
    o.engine.delete(r.id);
    await o.cycle();
    assert.equal(fake.calls.length, 0);
    assert.equal(o.records.routine(r.id), undefined);
    assert.equal(o.records.runs({ routineId: r.id }).length, 0);
    assert.throws(() => o.engine.history(r.id), /not found/);
    // Unknown bots are rejected with a useful message.
    assert.throws(
      () =>
        o.engine.create({
          ...r,
          botId: "22222222-2222-4222-8222-222222222222",
        }),
      /not found|Invalid|Unrecognized/,
    );
    // Validation diagnostics name the field.
    assert.throws(
      () =>
        routine(o, {
          work: {
            kind: "watcher",
            source: { action: "notion.create-page", arguments: {} },
          },
        }),
      /work.source.action: Watchers can only use read actions/,
    );
    assert.throws(
      () =>
        routine(o, {
          schedule: { kind: "once", date: "2026-01-01", time: "08:00" },
        }),
      /has already passed/,
    );
    assert.throws(
      () =>
        routine(o, {
          work: { kind: "goal", prompt: "x", until: "2027-06-01" },
        }),
      /at most 90 days/,
    );
    await close(o);
  }));

test("routine run records stay separate from definitions and survive restart", () =>
  withDir("routine-restart", async (dir) => {
    const c = clock();
    const fake = fakeHost();
    let o = open(dir, c, fake);
    const r = o.engine.setEnabled(routine(o).id, true);
    c.set("2026-10-14T02:31:00Z");
    await o.cycle();
    await close(o);
    o = open(dir, c, fake);
    const reloaded = o.records.routine(r.id)!;
    assert.equal(reloaded.enabled, true);
    assert.equal(reloaded.next!.key, "2026-10-15T08:00");
    const history: RoutineRun[] = runs(o, r.id);
    assert.equal(history.length, 1);
    assert.equal(history[0]!.state, "completed");
    // Templates never contain routines: the bot record has no routine fields.
    assert.equal(
      o.store.get<BotInstance>("bot", o.bot.id)!.routinesEnabled,
      false,
    );
    await close(o);
  }));

test("review: a proposal that expires untouched completes its run", () =>
  withDir("routine-expired", async (dir) => {
    const c = clock();
    const fake = fakeHost();
    const o = open(dir, c, fake);
    // The model proposes one change, as the broker would record it.
    fake.generate = async (input) => {
      const id = "33333333-3333-4333-8333-333333333333";
      o.store.put("action", id, {
        id,
        actor: {
          botId: input.bot.id,
          taskId: input.taskId,
          runId: input.runRef,
        },
        state: "pending",
        summary: "Create Notion page “Plan”",
        expiresAt: new Date(c.now() + DAY).toISOString(),
      } as unknown as ActionRecord);
      return "Proposed a page.";
    };
    const r = routine(o);
    o.engine.runNow(r.id);
    await o.cycle();
    assert.equal(runs(o, r.id)[0]!.state, "awaiting-approval");
    c.advance(DAY - MIN);
    await o.cycle();
    assert.equal(
      runs(o, r.id)[0]!.state,
      "awaiting-approval",
      "still approvable",
    );
    // The window ends without anyone touching the proposal.
    c.advance(2 * MIN);
    await o.cycle();
    const [run] = runs(o, r.id);
    assert.equal(run!.state, "completed");
    assert.equal(run!.reason, "Proposed changes: 1 expired.");
    await close(o);
  }));

test("review: editing to a past one-time schedule is rejected", () =>
  withDir("routine-edit-past", async (dir) => {
    const c = clock();
    const fake = fakeHost();
    const o = open(dir, c, fake);
    const past = { kind: "once", date: "2026-01-01", time: "08:00" };
    const r = o.engine.setEnabled(
      routine(o, {
        schedule: { kind: "once", date: "2026-10-20", time: "08:00" },
      }).id,
      true,
    );
    assert.throws(
      () => o.engine.edit(r.id, { schedule: past }),
      /schedule: 2026-01-01 08:00 has already passed in Asia\/Kolkata/,
    );
    assert.throws(
      () =>
        o.engine.preview({
          botId: r.botId,
          name: r.name,
          work: r.work,
          timezone: r.timezone,
          schedule: past,
        }),
      /has already passed/,
    );
    const stored = o.records.routine(r.id)!;
    assert.equal(stored.revision, r.revision);
    assert.equal(stored.next!.key, "2026-10-20T08:00");
    await close(o);
  }));

test("review: retries and resumptions do not use up the daily run limit", () =>
  withDir("routine-daily-runs", async (dir) => {
    const c = clock();
    const fake = fakeHost();
    let failures = 1;
    fake.generate = async () => {
      if (failures-- > 0)
        throw new ProviderFailure("rate_limited", "Rate limited.");
      return "ok";
    };
    const o = open(dir, c, fake);
    const r = routine(o, { limits: { maxRunsPerDay: 2 } });
    o.engine.runNow(r.id);
    await o.cycle();
    c.advance(MIN);
    await o.cycle();
    assert.equal(runs(o, r.id)[0]!.attempts.length, 2);
    // One run started (with two attempts): a second run is still allowed.
    o.engine.runNow(r.id);
    await o.cycle();
    assert.equal(
      runs(o, r.id).filter((x) => x.state === "completed").length,
      2,
    );
    assert.throws(() => o.engine.runNow(r.id), /runs-per-day limit/);
    await close(o);
  }));

test("review: closing Socius mid-run does not use up an attempt", () =>
  withDir("routine-shutdown", async (dir) => {
    const c = clock();
    const fake = fakeHost();
    // The first call waits until Socius closes; later calls answer.
    fake.generate = (input) =>
      fake.calls.length === 1
        ? new Promise((_, reject) =>
            input.signal.addEventListener("abort", () =>
              reject(new Error("aborted")),
            ),
          )
        : Promise.resolve("after restart");
    let o = open(dir, c, fake);
    const r = routine(o, { limits: { maxAttempts: 1 } });
    o.engine.runNow(r.id);
    await o.engine.tick();
    await until(o, r.id, "running");
    await close(o);
    o = open(dir, c, fake);
    assert.equal(
      runs(o, r.id)[0]!.state,
      "queued",
      "requeued, not interrupted",
    );
    await o.cycle();
    const [run] = runs(o, r.id);
    assert.equal(run!.state, "completed");
    assert.equal(run!.result, "after restart");
    assert.deepEqual(
      run!.attempts.map((a) => [a.outcome, a.error]),
      [
        ["interrupted", "Socius was closing."],
        ["completed", null],
      ],
    );
    await close(o);
  }));

test("review: next shows the scheduled occurrence while disabled", () =>
  withDir("routine-next", async (dir) => {
    const c = clock();
    const fake = fakeHost();
    const o = open(dir, c, fake);
    const r = routine(o);
    assert.equal(r.enabled, false);
    assert.equal(r.next!.key, "2026-10-14T08:00");
    o.engine.setEnabled(r.id, true);
    const off = o.engine.setEnabled(r.id, false);
    assert.equal(off.enabled, false);
    assert.equal(off.next!.key, "2026-10-14T08:00");
    assert.equal(o.engine.finish(r.id).next, null);
    await close(o);
  }));
