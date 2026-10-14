import { test } from "node:test";
import assert from "node:assert/strict";
import { RoutineInput, type Schedule } from "@socius/contracts/routines";
import {
  nextOccurrence,
  occurrencesBetween,
  quietRelease,
  resolveLocal,
} from "../src/routines/schedule.js";

const at = (iso: string) => Date.parse(iso);
const iso = (ms: number) => new Date(ms).toISOString();

test("daily and weekly occurrences follow local wall-clock time", () => {
  const daily = { kind: "daily", time: "08:00" } as const;
  // 08:00 in Kolkata (UTC+05:30) is 02:30 UTC; just before is not due yet.
  const first = nextOccurrence(
    daily,
    "Asia/Kolkata",
    at("2026-10-14T02:29:00Z"),
    0,
  )!;
  assert.equal(first.key, "2026-10-14T08:00");
  assert.equal(iso(first.at), "2026-10-14T02:30:00.000Z");
  // Exactly at the occurrence it is no longer "after", so the next day follows.
  const second = nextOccurrence(daily, "Asia/Kolkata", first.at, 0)!;
  assert.equal(second.key, "2026-10-15T08:00");

  const weekly: Schedule = {
    kind: "weekly",
    days: ["mon", "fri"],
    time: "09:00",
  };
  // 2026-10-14 is a Wednesday.
  const fri = nextOccurrence(
    weekly,
    "Europe/London",
    at("2026-10-14T12:00:00Z"),
    0,
  )!;
  assert.equal(fri.key, "2026-10-16T09:00");
  assert.equal(iso(fri.at), "2026-10-16T08:00:00.000Z"); // BST
  const mon = nextOccurrence(weekly, "Europe/London", fri.at, 0)!;
  assert.equal(mon.key, "2026-10-19T09:00");
  // After the clocks go back (25 Oct) London is UTC again.
  const later = nextOccurrence(
    weekly,
    "Europe/London",
    at("2026-10-27T00:00:00Z"),
    0,
  )!;
  assert.equal(iso(later.at), "2026-10-30T09:00:00.000Z");
});

test("one-time and interval schedules", () => {
  const once = { kind: "once", date: "2026-10-20", time: "18:45" } as const;
  assert.equal(
    iso(
      nextOccurrence(once, "America/New_York", at("2026-10-14T00:00:00Z"), 0)!
        .at,
    ),
    "2026-10-20T22:45:00.000Z",
  );
  assert.equal(
    nextOccurrence(once, "America/New_York", at("2026-10-21T00:00:00Z"), 0),
    null,
  );

  const interval = {
    kind: "interval",
    everyMinutes: 90,
    anchor: "2026-10-14T00:00:00.000Z",
  } as const;
  assert.equal(
    nextOccurrence(interval, "UTC", at("2026-10-13T00:00:00Z"), 0)!.key,
    "2026-10-14T00:00:00.000Z",
  );
  assert.equal(
    nextOccurrence(interval, "UTC", at("2026-10-14T00:00:00Z"), 0)!.key,
    "2026-10-14T01:30:00.000Z",
  );
  // Interval keys are UTC instants: unaffected by the zone or DST.
  assert.equal(
    nextOccurrence(interval, "America/New_York", at("2026-11-01T05:59:00Z"), 0)!
      .key,
    "2026-11-01T06:00:00.000Z",
  );
});

test("DST: skipped local times run after the gap, repeated ones run once", () => {
  const gap = resolveLocal("2026-03-08", "02:30", "America/New_York");
  assert.equal(gap.note, "shifted-past-gap");
  assert.equal(iso(gap.at), "2026-03-08T07:30:00.000Z"); // 03:30 EDT
  const repeated = resolveLocal("2026-11-01", "01:30", "America/New_York");
  assert.equal(repeated.note, "first-of-repeated");
  assert.equal(iso(repeated.at), "2026-11-01T05:30:00.000Z"); // first 01:30, EDT

  const daily = { kind: "daily", time: "01:30" } as const;
  const window = occurrencesBetween(
    daily,
    "America/New_York",
    at("2026-10-31T12:00:00Z"),
    at("2026-11-02T12:00:00Z"),
    0,
  );
  // Two calendar days, two occurrences, although 01:30 happened three times locally.
  assert.deepEqual(
    window.list.map((o) => o.key),
    ["2026-11-01T01:30", "2026-11-02T01:30"],
  );
  // Half-hour DST zone.
  assert.equal(
    iso(resolveLocal("2026-10-15", "08:00", "Australia/Lord_Howe").at),
    "2026-10-14T21:00:00.000Z",
  );
});

test("occurrence counts are exact for long gaps without enumerating every one", () => {
  const interval = {
    kind: "interval",
    everyMinutes: 15,
    anchor: "2026-10-14T00:00:00.000Z",
  } as const;
  const gap = occurrencesBetween(
    interval,
    "UTC",
    at("2026-10-14T00:00:00Z"),
    at("2026-10-21T00:00:00Z"),
    0,
    2,
  );
  assert.equal(gap.count, 7 * 24 * 4);
  assert.equal(gap.list.length, 2);
  assert.equal(gap.last!.key, "2026-10-21T00:00:00.000Z");
  const daily = occurrencesBetween(
    { kind: "daily", time: "07:00" },
    "Asia/Tokyo",
    at("2026-10-01T00:00:00Z"),
    at("2026-10-31T00:00:00Z"),
    0,
    1,
  );
  assert.equal(daily.count, 30);
});

test("quiet hours hold delivery until they end, including across midnight", () => {
  const quiet = { start: "22:00", end: "07:00" };
  // 22:30 in Kolkata → held until 07:00 the next morning.
  assert.equal(
    iso(quietRelease(at("2026-10-14T17:00:00Z"), "Asia/Kolkata", quiet)),
    "2026-10-15T01:30:00.000Z",
  );
  // 12:00 local is outside quiet hours.
  assert.equal(
    iso(quietRelease(at("2026-10-14T06:30:00Z"), "Asia/Kolkata", quiet)),
    "2026-10-14T06:30:00.000Z",
  );
  // Same-day window.
  assert.equal(
    iso(
      quietRelease(at("2026-10-14T13:00:00Z"), "UTC", {
        start: "12:00",
        end: "14:00",
      }),
    ),
    "2026-10-14T14:00:00.000Z",
  );
});

test("invalid or ambiguous routine input fails with useful diagnostics", () => {
  const base = {
    botId: "11111111-1111-4111-8111-111111111111",
    name: "Brief",
    work: { kind: "brief", prompt: "Summarize my day" },
    schedule: { kind: "daily", time: "08:00" },
    timezone: "Asia/Kolkata",
  };
  assert.ok(RoutineInput.safeParse(base).success);
  const issues = (patch: Record<string, unknown>) =>
    RoutineInput.safeParse({ ...base, ...patch }).error?.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`,
    );
  assert.deepEqual(issues({ timezone: "Mars/Olympus" }), [
    "timezone: Unknown IANA time zone",
  ]);
  assert.deepEqual(issues({ timezone: "local" }), [
    "timezone: Unknown IANA time zone",
  ]);
  assert.deepEqual(issues({ schedule: { kind: "daily", time: "8am" } }), [
    "schedule.time: Use 24-hour HH:MM",
  ]);
  assert.deepEqual(
    issues({ schedule: { kind: "once", date: "2026-02-30", time: "08:00" } }),
    ["schedule.date: That date does not exist"],
  );
  assert.deepEqual(
    issues({
      schedule: { kind: "weekly", days: ["mon", "mon"], time: "08:00" },
    }),
    ["schedule.days: Duplicate day"],
  );
  assert.ok(
    issues({ schedule: { kind: "interval", everyMinutes: 1 } })![0]!.startsWith(
      "schedule.everyMinutes",
    ),
  );
  // Defaults are the safe ones: skip missed runs, deliver only meaningful results.
  const parsed = RoutineInput.parse(base);
  assert.deepEqual(parsed.missedRuns, { policy: "skip" });
  assert.equal(parsed.notifications.deliver, "meaningful");
});
