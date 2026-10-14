import { z } from "zod";

// Private routines (A03), durable runs (A04) and quiet proactivity (A05).
// Definitions are private user state: they never appear in bot templates.

/** IANA zone name, validated by the runtime's time zone database. */
export const TimeZone = z
  .string()
  .min(1)
  .max(64)
  .refine((zone) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: zone });
      return zone !== "local";
    } catch {
      return false;
    }
  }, "Unknown IANA time zone");
/** Wall-clock time `HH:MM`, 24-hour. */
export const LocalTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM");
/** Calendar date `YYYY-MM-DD`, interpreted in the routine's time zone. */
export const LocalDate = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Use YYYY-MM-DD")
  .refine((d) => {
    const [y, m, day] = d.split("-").map(Number) as [number, number, number];
    const date = new Date(Date.UTC(y, m - 1, day));
    return date.getUTCMonth() === m - 1 && date.getUTCDate() === day;
  }, "That date does not exist");
export const Weekday = z.enum([
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
]);
export type Weekday = z.infer<typeof Weekday>;

export const Schedule = z.discriminatedUnion("kind", [
  /** Runs once at a local wall-clock time. */
  z.strictObject({ kind: z.literal("once"), date: LocalDate, time: LocalTime }),
  /** Every N minutes from an anchor instant. Independent of time zones and DST. */
  z.strictObject({
    kind: z.literal("interval"),
    everyMinutes: z
      .number()
      .int()
      .min(15)
      .max(7 * 24 * 60),
    /** First occurrence (UTC). Omitted: the moment the schedule is saved. */
    anchor: z.iso.datetime().optional(),
  }),
  z.strictObject({ kind: z.literal("daily"), time: LocalTime }),
  z.strictObject({
    kind: z.literal("weekly"),
    days: z
      .array(Weekday)
      .min(1)
      .max(7)
      .refine((a) => new Set(a).size === a.length, "Duplicate day"),
    time: LocalTime,
  }),
]);
export type Schedule = z.infer<typeof Schedule>;

/**
 * What happens to occurrences that passed while Socius was closed, asleep or
 * blocked. `skip` (default) records them and waits for the next one. `run-once`
 * coalesces every missed occurrence younger than `maxDelayMinutes` into one run.
 */
export const MissedRunPolicy = z.discriminatedUnion("policy", [
  z.strictObject({ policy: z.literal("skip") }),
  z.strictObject({
    policy: z.literal("run-once"),
    maxDelayMinutes: z
      .number()
      .int()
      .min(5)
      .max(7 * 24 * 60)
      .default(12 * 60),
  }),
]);
export type MissedRunPolicy = z.infer<typeof MissedRunPolicy>;

const limitFields = {
  /** Wall-clock budget for one attempt. */
  timeoutSeconds: z.number().int().min(30).max(600),
  /** Attempts per run, including automatic resumption after a restart. */
  maxAttempts: z.number().int().min(1).max(3),
  /** Runs started per rolling 24 hours, scheduled and manual together. */
  maxRunsPerDay: z.number().int().min(1).max(96),
  /** Characters of model output kept in history and notifications. */
  maxOutputChars: z.number().int().min(200).max(20_000),
};
export const RoutineLimits = z.strictObject({
  timeoutSeconds: limitFields.timeoutSeconds.default(180),
  maxAttempts: limitFields.maxAttempts.default(2),
  maxRunsPerDay: limitFields.maxRunsPerDay.default(24),
  maxOutputChars: limitFields.maxOutputChars.default(6000),
});
export type RoutineLimits = z.infer<typeof RoutineLimits>;

export const QuietHours = z
  .strictObject({ start: LocalTime, end: LocalTime })
  .refine((q) => q.start !== q.end, "Quiet hours need a start and an end");

const notificationFields = {
  /**
   * `meaningful` (default): only changes, completion, failure or a needed
   * action. `every-run`: also unchanged results. `never`: history only.
   */
  deliver: z.enum(["meaningful", "every-run", "never"]),
  /** Minimum minutes between notifications; changes in between coalesce. */
  cooldownMinutes: z
    .number()
    .int()
    .min(0)
    .max(7 * 24 * 60),
  /** Notifications created in these local hours are held until they end. */
  quietHours: QuietHours.optional(),
};
export const NotificationPolicy = z.strictObject({
  ...notificationFields,
  deliver: notificationFields.deliver.default("meaningful"),
  cooldownMinutes: notificationFields.cooldownMinutes.default(0),
});
export type NotificationPolicy = z.infer<typeof NotificationPolicy>;

/** A reviewed connector read the watcher performs itself, never through the model. */
export const WatchSource = z.strictObject({
  action: z.string().regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/),
  arguments: z.record(z.string(), z.unknown()),
});
export type WatchSource = z.infer<typeof WatchSource>;

const prompt = z.string().trim().min(1).max(4000);
export const RoutineWork = z.discriminatedUnion("kind", [
  /** A user-approved task the bot performs on schedule. */
  z.strictObject({ kind: z.literal("task"), prompt }),
  /** A scheduled brief. Empty briefs are skipped unless `deliverEmpty`. */
  z.strictObject({
    kind: z.literal("brief"),
    prompt,
    deliverEmpty: z.boolean().default(false),
  }),
  /** Reads one source; quiet while it is unchanged. */
  z.strictObject({
    kind: z.literal("watcher"),
    source: WatchSource,
    /** Optional: the bot judges whether a change matters and summarizes it. */
    prompt: prompt.optional(),
  }),
  /** Finite follow-ups toward one objective. Stops on completion or its bounds. */
  z.strictObject({
    kind: z.literal("goal"),
    prompt,
    /** Last local date a follow-up may run, at most 90 days ahead. */
    until: LocalDate,
    maxFollowUps: z.number().int().min(1).max(30).default(10),
  }),
]);
export type RoutineWork = z.infer<typeof RoutineWork>;

/** Fields the user supplies. Creating a routine never enables it. */
export const RoutineInput = z.strictObject({
  botId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  work: RoutineWork,
  schedule: Schedule,
  timezone: TimeZone,
  missedRuns: MissedRunPolicy.default({ policy: "skip" }),
  limits: RoutineLimits.default(RoutineLimits.parse({})),
  notifications: NotificationPolicy.default(NotificationPolicy.parse({})),
});
export type RoutineInput = z.infer<typeof RoutineInput>;
/**
 * Partial edit: omitted fields keep their value, `quietHours: null` clears them.
 * The runtime merges, then revalidates the whole routine. `enabled` never changes.
 */
export const RoutineEdit = z
  .strictObject({
    name: RoutineInput.shape.name,
    work: RoutineWork,
    schedule: Schedule,
    timezone: TimeZone,
    missedRuns: MissedRunPolicy,
    limits: z.strictObject(limitFields).partial(),
    notifications: z
      .strictObject({
        ...notificationFields,
        quietHours: QuietHours.nullable(),
      })
      .partial(),
  })
  .partial();
export type RoutineEdit = z.infer<typeof RoutineEdit>;

export interface Routine extends RoutineInput {
  id: string;
  /** Off until the owner explicitly enables it; edits never change it. */
  enabled: boolean;
  /** Increments on every edit. Runs record the revision they executed. */
  revision: number;
  /** Next scheduled occurrence for preview; null when disabled or finished. */
  next: { key: string; at: string } | null;
  /** Upper bound of the occurrence window already evaluated (UTC). */
  evaluatedThrough: string;
  /** Checks still run and are recorded, but nothing is delivered. */
  muted: boolean;
  /** Notifications are held until this instant; checks continue. */
  snoozedUntil: string | null;
  /** Finished routines (goal completed or bounds reached, once ran) never run again. */
  finishedAt: string | null;
  finishedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RunState =
  | "queued"
  | "running"
  | "awaiting-approval"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped"
  | "blocked"
  | "interrupted";
export const TERMINAL_RUN_STATES: readonly RunState[] = [
  "completed",
  "failed",
  "cancelled",
  "skipped",
  "blocked",
  "interrupted",
];
export type RunTrigger = "schedule" | "catch-up" | "manual";
export interface RunAttempt {
  n: number;
  /** Chat-task record used for this attempt, so approvals link to it. */
  taskId: string;
  /** Runtime ownership fence held while the attempt ran. */
  fence: number;
  startedAt: string;
  endedAt: string | null;
  outcome:
    | "completed"
    | "failed"
    | "cancelled"
    | "interrupted"
    | "fenced"
    | "awaiting-approval"
    | null;
  error: string | null;
}
/** One logical execution of a routine. Occurrence keys are unique per routine. */
export interface RoutineRun {
  id: string;
  routineId: string;
  botId: string;
  /** Wall-clock (or UTC for intervals) identity; null for manual runs. */
  occurrenceKey: string | null;
  trigger: RunTrigger;
  revision: number;
  state: RunState;
  /** Missed occurrences this run covers or records (coalesced). */
  covers: { count: number; firstAt: string; lastAt: string } | null;
  scheduledAt: string | null;
  dueAt: string;
  startedAt: string | null;
  endedAt: string | null;
  attempts: RunAttempt[];
  model: { connectionId: string; modelId: string } | null;
  /** Why the run was skipped, blocked, failed or interrupted. Never a credential. */
  reason: string | null;
  /** Bounded, redacted result summary. */
  result: string | null;
  /** External write proposals created by this run, through the action broker. */
  actionIds: string[];
  notificationId: string | null;
  createdAt: string;
  updatedAt: string;
}
export type StepKind = "model" | "read" | "observe" | "deliver";
/** A checkpoint. A completed step is reused on resume, never executed again. */
export interface RunStep {
  runId: string;
  key: string;
  kind: StepKind;
  state: "started" | "completed" | "failed";
  attempt: number;
  /** Bounded result needed to resume; never closures, credentials or SDK state. */
  output: string | null;
  error: string | null;
  startedAt: string;
  endedAt: string | null;
}
/** Persisted watcher comparison state, separate from run execution. */
export interface WatcherState {
  routineId: string;
  /** Digest of the last successful observation. */
  observed: string | null;
  observedAt: string | null;
  /** Digest the user was last notified about (or the first baseline). */
  notified: string | null;
  notifiedAt: string | null;
  /** Bounded copy of the notified observation, for describing changes. */
  notifiedExcerpt: string | null;
  /** Failure/setup notice already sent; repeats are suppressed until success. */
  noticeKey: string | null;
}
export type NotificationKind =
  | "result"
  | "change"
  | "brief"
  | "follow-up"
  | "approval-needed"
  | "failure"
  | "setup-needed"
  | "finished";
export interface RoutineNotification {
  id: string;
  routineId: string;
  runId: string;
  botId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Observation time for watcher changes. */
  observedAt: string | null;
  /** Links supplied by the source adapter. */
  links: string[];
  /** Unique: the same change or notice is delivered at most once. */
  dedupeKey: string;
  /** Held during quiet hours or snooze until this instant. */
  deliverAt: string;
  read: boolean;
  createdAt: string;
}
export interface SchedulerStatus {
  /** `active` owns the workspace lease; `standby` means another runtime does. */
  state: "active" | "standby" | "stopped";
  fence: number | null;
  lastTickAt: string | null;
  queued: number;
  running: number;
}
export interface RoutinesSnapshot {
  routines: Routine[];
  runs: RoutineRun[];
  notifications: RoutineNotification[];
  scheduler: SchedulerStatus;
}
