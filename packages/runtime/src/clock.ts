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
  return `Current date and time: ${t.weekday}, ${t.date}, ${t.time} (${t.timeZone}, UTC${t.utcOffset}), from this computer's clock at ${t.iso}.${
    canCallTools
      ? " For an exact current time later in a long task, or another time zone, call getCurrentTime."
      : ""
  }`;
}

export interface EnvironmentFacts {
  now: Date;
  timeZone: string;
  /** The selected model's display name, e.g. "NVIDIA: Nemotron 3 Super (free)". */
  model?: string | undefined;
  /** Where the user is writing from. */
  client?: "desktop" | "phone" | undefined;
  /** Names of the tools this call can actually use. */
  tools: string[];
}

/**
 * Runtime facts placed first in every model call (issue #25 H01, H07, H08), so
 * weaker models cannot miss them behind role instructions. Built from what this
 * call really has: tools that are not supplied are never mentioned.
 */
export function environmentContext(e: EnvironmentFacts) {
  const t = timeFacts(e.now, e.timeZone);
  const lines = [
    "Runtime facts for this message (from the computer running Socius; trust them):",
    `- Now: ${t.weekday}, ${t.date}, ${t.time} in ${t.timeZone} (UTC${t.utcOffset}).`,
    ...(e.model ? [`- Model: you are running on "${e.model}".`] : []),
    ...(e.client === "phone"
      ? [
          "- The user is writing from their phone, connected privately to Socius on their computer. Keep replies easy to read on a small screen.",
        ]
      : e.client === "desktop"
        ? ["- The user is writing from the Socius desktop app."]
        : []),
    e.tools.length
      ? `- Tools you can call right now: ${e.tools.join(", ")}. Nothing else is available.`
      : "- You have no tools in this call; answer from what you know and the conversation.",
    "",
    "How to use them:",
    "- You know the current date, time and day from these facts. Answer questions about them, or about how long until something, directly and in one line. Never say you can't access the time or a clock, and never use a browser, search or other tool just to find the current time.",
    "- If an earlier reply in this conversation said you could not tell the time or answer something general, that was a mistake: correct it rather than repeating it.",
    ...(e.tools.includes("getCurrentTime")
      ? [
          "- For the exact time later in a long task, or the time in another place, call getCurrentTime.",
        ]
      : []),
    "- Answer general questions (knowledge, explanations, writing, maths, code, advice) directly from what you know. Tool and app limits are about actions and live data, never about knowledge.",
  ];
  return lines.join("\n");
}
