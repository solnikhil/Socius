/**
 * Runtime time facts for model calls (issue #25, H01–H02). Generated from the
 * execution host's clock on every call, never from the model's training data.
 */

/** The host's IANA time zone, e.g. "Asia/Kolkata". */
export const hostTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function isTimeZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** "+05:30" style offset of `zone` at `now`. */
export function utcOffset(now: Date, zone: string) {
  const name =
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "longOffset",
    })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const offset = name.replace("GMT", "");
  return offset === "" ? "+00:00" : offset;
}

export interface TimeFacts {
  iso: string;
  timeZone: string;
  utcOffset: string;
  weekday: string;
  date: string;
  time: string;
}

export function timeFacts(now: Date, zone: string): TimeFacts {
  const part = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, ...opts }).format(now);
  return {
    iso: now.toISOString(),
    timeZone: zone,
    utcOffset: utcOffset(now, zone),
    weekday: part({ weekday: "long" }),
    date: part({ day: "numeric", month: "long", year: "numeric" }),
    time: part({ hour: "2-digit", minute: "2-digit", hour12: false }),
  };
}

/** One instruction line giving the model the current local date and time. */
export function timeContext(now: Date, zone: string, canCallTools = true) {
  const t = timeFacts(now, zone);
  return `Current date and time: ${t.weekday}, ${t.date}, ${t.time} (${t.timeZone}, UTC${t.utcOffset}), from this computer's clock at ${t.iso}. Use it for "today", "now", deadlines and relative dates.${
    canCallTools
      ? " For an exact current time later in a long task, or another time zone, call getCurrentTime."
      : ""
  }`;
}
