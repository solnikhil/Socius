import { z } from "zod";
import type {
  Approval,
  BoardBudgets,
  BoardSource,
  BoardTask,
} from "@socius/contracts/app";

// Execution bounds only. Roster size is deliberately unbounded.
export const defaultBudgets: BoardBudgets = {
  concurrency: 3,
  maxTasks: 12,
  maxModelCalls: 40,
  maxStepsPerCall: 6,
  callTimeoutMs: 180000,
  maxOutputTokens: 4000,
  maxRunTokens: 400000,
};
export const BudgetsSchema = z.strictObject({
  concurrency: z.number().int().min(1).max(32),
  maxTasks: z.number().int().min(1).max(100),
  maxModelCalls: z.number().int().min(3).max(1000),
  maxStepsPerCall: z.number().int().min(1).max(20),
  callTimeoutMs: z.number().int().min(1000).max(900000),
  maxOutputTokens: z.number().int().min(100).max(32000),
  maxRunTokens: z.number().int().min(1000).max(10000000),
});
const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const uniqueIds = z
  .array(uuid)
  .refine((a) => new Set(a).size === a.length, "Duplicate bot");
export const CreateBoardSchema = z.strictObject({
  name: text(100),
  objective: text(2000),
  completionCriteria: z.string().trim().max(2000).default(""),
  memberIds: uniqueIds.min(1),
  coordinatorId: uuid,
  budgets: BudgetsSchema.partial().optional(),
  reviewPlan: z.boolean().default(true),
});
export const UpdateBoardSchema = z.strictObject({
  name: text(100).optional(),
  objective: text(2000).optional(),
  completionCriteria: z.string().trim().max(2000).optional(),
  coordinatorId: uuid.optional(),
  budgets: BudgetsSchema.partial().optional(),
  reviewPlan: z.boolean().optional(),
  archived: z.boolean().optional(),
});
export const MemberSchema = z.strictObject({
  botId: uuid,
  role: z.string().trim().max(200).default(""),
});
export const SourceSchema = z.strictObject({
  name: text(200),
  text: z.string().min(1).max(200000),
});
export const RunRequestSchema = z.strictObject({ content: text(20000) });

export const PlanSchema = z.strictObject({
  summary: z.string().trim().min(1).max(2000),
  tasks: z
    .array(
      z.strictObject({
        key: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
        title: text(200),
        instructions: text(8000),
        assigneeId: uuid,
        dependsOn: z.array(z.string()).max(50).default([]),
        sourceIds: z.array(uuid).max(50).default([]),
      }),
    )
    .min(1),
});
export type Plan = z.infer<typeof PlanSchema>;

/** Validates a coordinator's proposed task graph against the board. */
export function validatePlan(
  input: unknown,
  board: { memberIds: string[]; sourceIds: string[]; maxTasks: number },
): { plan: Plan; errors: [] } | { plan: null; errors: string[] } {
  const parsed = PlanSchema.safeParse(input);
  if (!parsed.success)
    return {
      plan: null,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join(".") || "plan"}: ${i.message}`,
      ),
    };
  const plan = parsed.data,
    errors: string[] = [];
  if (plan.tasks.length > board.maxTasks)
    errors.push(
      `The plan has ${plan.tasks.length} tasks; this board allows ${board.maxTasks} per run.`,
    );
  const keys = new Set<string>();
  for (const t of plan.tasks) {
    if (keys.has(t.key)) errors.push(`Duplicate task key "${t.key}".`);
    keys.add(t.key);
    if (!board.memberIds.includes(t.assigneeId))
      errors.push(`Task "${t.key}" is assigned to a bot outside this board.`);
    for (const s of t.sourceIds)
      if (!board.sourceIds.includes(s))
        errors.push(`Task "${t.key}" references an unshared source.`);
  }
  for (const t of plan.tasks)
    for (const d of t.dependsOn)
      if (d === t.key || !keys.has(d))
        errors.push(`Task "${t.key}" has an invalid dependency "${d}".`);
  if (!errors.length && hasCycle(plan.tasks))
    errors.push("Task dependencies must not be circular.");
  return errors.length ? { plan: null, errors } : { plan, errors: [] };
}
function hasCycle(tasks: { key: string; dependsOn: string[] }[]) {
  const remaining = new Map(tasks.map((t) => [t.key, new Set(t.dependsOn)]));
  let progressed = true;
  while (remaining.size && progressed) {
    progressed = false;
    for (const [key, deps] of remaining)
      if ([...deps].every((d) => !remaining.has(d))) {
        remaining.delete(key);
        progressed = true;
      }
  }
  return remaining.size > 0;
}

export const terminalTaskStates = new Set<BoardTask["state"]>([
  "done",
  "failed",
  "cancelled",
  "interrupted",
]);
/** A task whose dependency ended without a result cannot proceed without the user. */
export function blockedBy(task: BoardTask, tasks: BoardTask[]) {
  return tasks.filter(
    (t) =>
      task.dependsOn.includes(t.key) &&
      terminalTaskStates.has(t.state) &&
      t.state !== "done",
  );
}
export type BoardColumn =
  "backlog" | "ready" | "working" | "review" | "done" | "history";
export function columnOf(
  task: BoardTask,
  tasks: BoardTask[],
  approvals: Approval[] = [],
): BoardColumn {
  const pending = approvals.some(
    (a) => a.taskId === task.id && a.state === "pending",
  );
  if (pending) return "review";
  if (task.state === "backlog")
    return blockedBy(task, tasks).length ? "review" : "backlog";
  if (
    task.state === "ready" ||
    task.state === "working" ||
    task.state === "done"
  )
    return task.state;
  return "history";
}
export function sourcesFor(task: BoardTask, sources: BoardSource[]) {
  return sources.filter((s) => task.sourceIds.includes(s.id));
}
