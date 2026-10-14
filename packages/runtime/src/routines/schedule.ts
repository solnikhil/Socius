// Time-zone-aware occurrence math. Pure functions over an explicit clock value.
//
// Occurrence identity: wall-clock schedules use the local `YYYY-MM-DDTHH:MM` as
// their key, so a repeated hour (DST fall-back), a time-zone edit or a clock
// change can never produce a second run of the same local occurrence. Interval
// schedules are UTC-based and keyed by their UTC instant.
//
// DST: a local time that does not exist (spring-forward gap) runs at the same
// distance after the gap starts, e.g. 02:30 becomes 03:30. A local time that
// occurs twice (fall-back) runs at its first instance only.
import type { Schedule, Weekday } from "@socius/contracts/routines";

const MINUTE = 60_000;
const DAY = 86_400_000;
const WEEKDAYS: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export interface Occurrence {
  key: string;
  /** UTC milliseconds. */
  at: number;
  /** Set when DST moved or disambiguated the local time. */
  note?: "shifted-past-gap" | "first-of-repeated";
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string) {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(zone, f);
  }
  return f;
}
/** Local calendar fields of an instant in `zone`. */
export function zonedParts(ms: number, zone: string) {
  const parts: Record<string, number> = {};
  for (const p of formatter(zone).formatToParts(new Date(ms)))
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
    second: parts.second!,
  };
}
const pad = (n: number) => String(n).padStart(2, "0");
/** Local `YYYY-MM-DD` of an instant. */
export function localDate(ms: number, zone: string) {
  const p = zonedParts(ms, zone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}
/** Local `HH:MM` of an instant. */
export function localTime(ms: number, zone: string) {
  const p = zonedParts(ms, zone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}
/** UTC offset of `zone` at an instant, in milliseconds. */
function offsetAt(ms: number, zone: string) {
  const p = zonedParts(ms, zone);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return asUtc - Math.floor(ms / 1000) * 1000;
}
export function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d) + days * DAY);
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}
export function weekdayOf(date: string): Weekday {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]!;
}
/** The instant a local wall-clock time happens in `zone`, with DST rules above. */
export function resolveLocal(
  date: string,
  time: string,
  zone: string,
): Omit<Occurrence, "key"> {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  // Offsets on either side of any transition near this wall time.
  const before = offsetAt(wall - DAY / 2, zone);
  const after = offsetAt(wall + DAY / 2, zone);
  const matches = [...new Set([wall - before, wall - after])]
    .filter((c) => {
      const p = zonedParts(c, zone);
      return (
        p.year === y &&
        p.month === m &&
        p.day === d &&
        p.hour === hh &&
        p.minute === mm
      );
    })
    .sort((a, b) => a - b);
  if (matches.length > 1) return { at: matches[0]!, note: "first-of-repeated" };
  if (matches.length === 1) return { at: matches[0]! };
  // In a gap: the pre-transition offset lands the same distance past the gap.
  return { at: wall - before, note: "shifted-past-gap" };
}

function withNote(key: string, r: Omit<Occurrence, "key">): Occurrence {
  return r.note ? { key, at: r.at, note: r.note } : { key, at: r.at };
}

/**
 * First occurrence strictly after `afterMs`. `anchorMs` is the interval
 * anchor used when the schedule omits one. Returns null when none remains.
 */
export function nextOccurrence(
  schedule: Schedule,
  zone: string,
  afterMs: number,
  anchorMs: number,
): Occurrence | null {
  switch (schedule.kind) {
    case "once": {
      const r = resolveLocal(schedule.date, schedule.time, zone);
      return r.at > afterMs
        ? withNote(`${schedule.date}T${schedule.time}`, r)
        : null;
    }
    case "interval": {
      const anchor = schedule.anchor ? Date.parse(schedule.anchor) : anchorMs;
      const period = schedule.everyMinutes * MINUTE;
      const n =
        afterMs < anchor ? 0 : Math.floor((afterMs - anchor) / period) + 1;
      const at = anchor + n * period;
      return { key: new Date(at).toISOString(), at };
    }
    case "daily":
    case "weekly": {
      // Start a day early: the local date of `afterMs` may lag UTC.
      let date = addDays(localDate(afterMs, zone), -1);
      for (let i = 0; i < 16; i++, date = addDays(date, 1)) {
        if (
          schedule.kind === "weekly" &&
          !schedule.days.includes(weekdayOf(date))
        )
          continue;
        const r = resolveLocal(date, schedule.time, zone);
        if (r.at > afterMs) return withNote(`${date}T${schedule.time}`, r);
      }
      return null;
    }
  }
}

/**
 * Occurrences in (fromMs, toMs], oldest first, at most `limit`. `count` is
 * exact even when the list is truncated (computed for intervals, bounded
 * iteration otherwise).
 */
export function occurrencesBetween(
  schedule: Schedule,
  zone: string,
  fromMs: number,
  toMs: number,
  anchorMs: number,
  limit = 500,
): { list: Occurrence[]; count: number; last: Occurrence | null } {
  const list: Occurrence[] = [];
  if (toMs <= fromMs) return { list, count: 0, last: null };
  if (schedule.kind === "interval") {
    const anchor = schedule.anchor ? Date.parse(schedule.anchor) : anchorMs;
    const period = schedule.everyMinutes * MINUTE;
    const first = nextOccurrence(schedule, zone, fromMs, anchorMs)!;
    if (first.at > toMs) return { list, count: 0, last: null };
    const lastN = Math.floor((toMs - anchor) / period);
    const lastAt = anchor + lastN * period;
    const count = Math.round((lastAt - first.at) / period) + 1;
    for (let at = first.at; at <= toMs && list.length < limit; at += period)
      list.push({ key: new Date(at).toISOString(), at });
    return {
      list,
      count,
      last: { key: new Date(lastAt).toISOString(), at: lastAt },
    };
  }
  let cursor = fromMs,
    count = 0,
    last: Occurrence | null = null;
  // Wall-clock schedules run at most daily, so 10,000 covers decades.
  while (count < 10_000) {
    const next = nextOccurrence(schedule, zone, cursor, anchorMs);
    if (!next || next.at > toMs) break;
    count++;
    last = next;
    if (list.length < limit) list.push(next);
    cursor = next.at;
  }
  return { list, count, last };
}

/** Whether a local time falls in [start, end), wrapping past midnight. */
export function inQuietHours(
  ms: number,
  zone: string,
  quiet: { start: string; end: string },
) {
  const t = localTime(ms, zone);
  return quiet.start < quiet.end
    ? t >= quiet.start && t < quiet.end
    : t >= quiet.start || t < quiet.end;
}
/** When a notification created at `ms` may be shown: now, or when quiet hours end. */
export function quietRelease(
  ms: number,
  zone: string,
  quiet: { start: string; end: string } | undefined,
) {
  if (!quiet || !inQuietHours(ms, zone, quiet)) return ms;
  let date = localDate(ms, zone);
  for (let i = 0; i < 3; i++, date = addDays(date, 1)) {
    const end = resolveLocal(date, quiet.end, zone).at;
    if (end > ms) return end;
  }
  return ms;
}
