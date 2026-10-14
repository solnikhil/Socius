// The single external-action policy point for single bots, board tasks and delegated work.
// Callers submit a typed request naming a reviewed action; they cannot supply code or
// grant themselves permissions. Authorization is rechecked at request and execution.
import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  ActionRequest,
  type ActionRequest as ActionRequestType,
  type BotInstance,
} from "@socius/contracts";
import type { ActionRecord, Installation } from "@socius/contracts/app";
import { canonicalJson, digestOf } from "@socius/marketplace";
import {
  ConnectorError,
  reviewedConnectors,
  verifyManifest,
  type ActionOutput,
  type ConnectorAction,
  type ReviewedConnector,
} from "@socius/connectors";
import type { Store } from "./store.js";
import { PackageError, type PackageService } from "./packages.js";
import { OpenError, type ConnectionService } from "./connections.js";

const fail = (status: number, message: string): never => {
  throw new PackageError(status, message);
};
const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export interface BrokerOptions {
  timeoutMs?: number;
  approvalTtlMs?: number;
  now?: () => number;
}
export type BrokerResult =
  | { status: "completed"; summary: string; data: string | null }
  | { status: "awaiting-approval"; actionId: string; summary: string };
const MAX_ATTEMPTS = 3;
const MAX_PENDING_PER_TASK = 5;
const MAX_READS_PER_TASK = 20;
/**
 * A failure that happened before the write request was sent (opening the session or
 * the pre-write check) proves nothing was written, so it is a definite failure.
 */
function beforeWrite(error: unknown): ConnectorError {
  const failure =
    error instanceof OpenError
      ? error.failure
      : error instanceof ConnectorError
        ? error
        : null;
  if (failure?.kind === "auth" || failure?.kind === "rate-limited")
    return failure;
  return new ConnectorError(
    "rejected",
    failure?.kind === "rejected"
      ? failure.message
      : "Socius could not reach the service, so nothing was written.",
  );
}
type ReconcileResult = "found" | "absent" | "unknown";

export class ActionBroker {
  private readonly reads = new Map<string, number>();
  constructor(
    private readonly store: Store,
    private readonly packages: PackageService,
    private readonly connections: ConnectionService,
    private readonly options: BrokerOptions = {},
  ) {}
  private now() {
    return this.options.now?.() ?? Date.now();
  }
  /** Releases per-task bookkeeping once a task ends. */
  forgetTask(taskId: string) {
    this.reads.delete(taskId);
  }
  private find(actionId: string): {
    connector: ReviewedConnector;
    action: ConnectorAction;
  } {
    for (const connector of reviewedConnectors) {
      const action = connector.actions.find((a) => a.id === actionId);
      if (action) return { connector, action };
    }
    return fail(404, `Unknown action ${actionId}`);
  }
  /** Every check that must hold for the action to run now. Fails closed. */
  private authorize(request: ActionRequestType) {
    const bot =
      this.store.get<BotInstance>("bot", request.actor.botId) ??
      fail(404, "Bot not found");
    const { connector, action } = this.find(request.action);
    if (request.release.id !== connector.id)
      fail(403, "The action does not belong to that release");
    const receipt =
      this.store.get<Installation>("installation", connector.id) ??
      fail(403, `${connector.id} is not installed`);
    if (!receipt.enabled) fail(403, `${connector.id} is disabled`);
    if (
      receipt.version !== request.release.version ||
      receipt.digest !== request.release.digest
    )
      fail(
        409,
        "The installed release changed. Ask again so the new release can be reviewed.",
      );
    const release = this.packages.installedRelease(connector.id);
    if (
      !release ||
      release.manifest.kind !== "connector" ||
      verifyManifest(release.manifest).length
    )
      fail(403, "The installed connector does not match reviewed code");
    if (
      !release!.manifest.capabilities.includes(action.capability) ||
      !receipt.consentedCapabilities.includes(action.capability)
    )
      fail(403, `The installation was not consented for ${action.capability}`);
    if (!bot.grantedCapabilities.includes(action.capability))
      fail(403, `${bot.name} has not been granted ${action.capability}`);
    const connection = this.connections.forConnector(connector.id);
    if (!connection) fail(409, `${release!.manifest.name} is not connected`);
    if (connection!.state !== "ready")
      fail(
        409,
        `${release!.manifest.name} is not ready: ${connection!.detail || connection!.state}`,
      );
    const parsed = action.input.safeParse(request.arguments);
    if (!parsed.success)
      fail(
        400,
        `Invalid arguments for ${action.id}: ${parsed.error.issues[0]?.message ?? "invalid"}`,
      );
    return {
      bot,
      connector,
      action,
      connection: connection!,
      args: parsed.data!,
    };
  }
  private recordDigest(
    record: Pick<
      ActionRecord,
      | "actor"
      | "release"
      | "action"
      | "connectionId"
      | "arguments"
      | "expiresAt"
    >,
  ) {
    return digestOf({
      actor: record.actor,
      release: record.release,
      action: record.action,
      connectionId: record.connectionId,
      arguments: record.arguments,
      expiresAt: record.expiresAt,
    });
  }

  async request(input: unknown): Promise<BrokerResult> {
    const parsed = ActionRequest.safeParse(input);
    if (!parsed.success) return fail(400, "Invalid action request");
    const request = parsed.data;
    const { action, connection, args } = this.authorize(request);
    if (action.access === "read") {
      const count = (this.reads.get(request.actor.taskId) ?? 0) + 1;
      if (count > MAX_READS_PER_TASK)
        fail(429, "Read limit for this task reached");
      this.reads.set(request.actor.taskId, count);
      try {
        const output = await this.connections.use(connection.id, (client) =>
          this.withTimeout(action.execute(client, args)),
        );
        this.store.event("connector.read", output.summary);
        return {
          status: "completed",
          summary: output.summary,
          data: output.data ?? null,
        };
      } catch (error) {
        const failure = error instanceof OpenError ? error.failure : error;
        if (failure instanceof ConnectorError)
          return fail(502, failure.message);
        throw error;
      }
    }
    const pending = this.store
      .all<ActionRecord>("action")
      .filter(
        (a) => a.actor.taskId === request.actor.taskId && a.state === "pending",
      );
    if (pending.length >= MAX_PENDING_PER_TASK)
      fail(429, "Proposal limit reached for this task");
    const now = new Date(this.now()).toISOString();
    const base = {
      actor: request.actor,
      release: request.release,
      action: action.id,
      connectionId: connection.id,
      arguments: args,
      expiresAt: new Date(
        this.now() + (this.options.approvalTtlMs ?? 86_400_000),
      ).toISOString(),
    };
    const record: ActionRecord = {
      id: randomUUID(),
      ...base,
      capability: action.capability,
      summary: action.describe(args),
      digest: this.recordDigest(base),
      state: "pending",
      attempts: [],
      result: null,
      error: null,
      retryable: false,
      createdAt: now,
      updatedAt: now,
    };
    this.store.put("action", record.id, record);
    this.store.event("action.requested", `Approval needed: ${record.summary}`);
    return {
      status: "awaiting-approval",
      actionId: record.id,
      summary: record.summary,
    };
  }

  private save(record: ActionRecord, patch: Partial<ActionRecord>) {
    Object.assign(record, patch, {
      updatedAt: new Date(this.now()).toISOString(),
    });
    this.store.put("action", record.id, record);
    return record;
  }
  private load(id: string) {
    return (
      this.store.get<ActionRecord>("action", z.string().uuid().parse(id)) ??
      fail(404, "Action not found")
    );
  }
  /** Rebuilds and rechecks the original request; any drift or tampering blocks execution. */
  private reauthorize(record: ActionRecord) {
    if (record.digest !== this.recordDigest(record))
      fail(409, "Proposal content changed");
    if (Date.parse(record.expiresAt) < this.now()) {
      this.save(record, {
        state: "expired",
        error: "The approval window ended.",
      });
      fail(409, "Proposal expired");
    }
    try {
      const checked = this.authorize({
        actor: record.actor,
        release: record.release,
        action: record.action,
        arguments: record.arguments,
      });
      if (canonicalJson(checked.args) !== canonicalJson(record.arguments))
        fail(409, "Proposal content changed");
      if (checked.connection.id !== record.connectionId)
        fail(
          409,
          "The account connection changed. Ask again so the new account can be reviewed.",
        );
      return checked;
    } catch (error) {
      if (error instanceof PackageError && record.state === "pending")
        this.save(record, { state: "blocked", error: error.message });
      throw error;
    }
  }

  async resolve(input: { id: string; digest: string; approve: boolean }) {
    const record = this.load(input.id);
    if (record.state !== "pending")
      fail(409, "This proposal was already resolved");
    if (!same(record.digest, input.digest))
      fail(409, "Proposal content changed");
    if (!input.approve) {
      if (record.digest !== this.recordDigest(record))
        fail(409, "Proposal content changed");
      this.save(record, { state: "denied" });
      this.store.event("action.denied", `Declined: ${record.summary}`);
      return record;
    }
    const checked = this.reauthorize(record);
    this.store.event("action.approved", `Approved: ${record.summary}`);
    return this.execute(record, checked.action, checked.args);
  }

  /** User-initiated retry, only after the previous attempt proved nothing happened. */
  async retry(id: string) {
    const record = this.load(id);
    if (
      !(record.state === "failed" || record.state === "unknown") ||
      !record.retryable
    )
      fail(
        409,
        "Retry is only possible after Socius confirmed the change did not happen",
      );
    if (record.attempts.length >= MAX_ATTEMPTS)
      fail(
        409,
        "Attempt limit reached. Ask the bot to propose the change again.",
      );
    const checked = this.reauthorize(record);
    this.store.event(
      "action.retried",
      `Retrying after confirmation: ${record.summary}`,
    );
    return this.execute(record, checked.action, checked.args);
  }

  /** Looks for the effect of an ambiguous write. Never repeats the write itself. */
  async check(id: string) {
    const record = this.load(id);
    if (record.state !== "unknown")
      fail(409, "Only changes with an unknown outcome can be checked");
    const { action } = this.find(record.action);
    const args = action.input.parse(record.arguments);
    const result = await this.reconcile(record, action, args);
    // Only a check that ran and found nothing makes a retry reasonable.
    if (result === "absent")
      this.save(record, {
        retryable: true,
        error:
          "Socius could not find the change. You can retry; if the service is still processing it, a retry may create a duplicate.",
      });
    if (result === "unknown")
      this.save(record, {
        error:
          "Socius could not check the service right now (offline, signed out or no earlier snapshot). Try Check again later.",
      });
    return record;
  }

  private async reconcile(
    record: ActionRecord,
    action: ConnectorAction,
    args: Record<string, unknown>,
  ): Promise<ReconcileResult> {
    if (!action.reconcile) return "unknown";
    const reconcile = action.reconcile;
    try {
      const output = await this.connections.use(record.connectionId, (client) =>
        this.withTimeout(
          reconcile(client, args, record.attempts.at(-1)?.baseline ?? null),
        ),
      );
      if (!output) return "absent";
      this.succeed(
        record,
        output,
        "Confirmed by checking the service after an unclear response.",
      );
      return "found";
    } catch {
      return "unknown";
    }
  }
  private succeed(
    record: ActionRecord,
    output: ActionOutput,
    detail: string | null = null,
  ) {
    const attempt = record.attempts.at(-1);
    if (attempt)
      Object.assign(attempt, {
        outcome: "succeeded",
        detail: detail ?? attempt.detail,
      });
    this.save(record, {
      state: "succeeded",
      result: { summary: output.summary, url: output.url ?? null },
      error: null,
      retryable: false,
    });
    this.store.event("action.succeeded", output.summary);
  }

  private async execute(
    record: ActionRecord,
    action: ConnectorAction,
    args: Record<string, unknown>,
  ) {
    const attempt = {
      id: randomUUID(),
      startedAt: new Date(this.now()).toISOString(),
      finishedAt: null as string | null,
      outcome: null as ActionRecord["attempts"][number]["outcome"],
      detail: null as string | null,
      baseline: null as string | null,
    };
    // Persist intent before any remote call, so a crash leaves an "unknown", never a replay.
    this.save(record, {
      state: "executing",
      attempts: [...record.attempts, attempt],
      error: null,
      retryable: false,
    });
    const current = record.attempts.at(-1)!;
    try {
      const output = await this.connections.use(
        record.connectionId,
        async (client) => {
          if (action.prepare) {
            try {
              current.baseline = await this.withTimeout(
                action.prepare(client, args),
              );
            } catch (error) {
              throw beforeWrite(error);
            }
            this.save(record, {});
          }
          return this.withTimeout(action.execute(client, args));
        },
      );
      current.finishedAt = new Date(this.now()).toISOString();
      this.succeed(record, output);
    } catch (error) {
      current.finishedAt = new Date(this.now()).toISOString();
      const failure =
        error instanceof OpenError
          ? beforeWrite(error)
          : error instanceof ConnectorError
            ? error
            : new ConnectorError(
                "ambiguous",
                "The change failed unexpectedly.",
              );
      current.detail = failure.message;
      if (failure.kind === "auth")
        this.connections.markAuthRequired(record.connectionId);
      if (failure.kind === "ambiguous") {
        current.outcome = "ambiguous";
        this.save(record, {
          state: "unknown",
          retryable: false,
          error:
            "The service did not confirm the outcome. Socius checked once and will not repeat the change automatically.",
        });
        this.store.event(
          "action.unknown",
          `Outcome unknown: ${record.summary}`,
        );
        await this.reconcile(record, action, args);
      } else {
        current.outcome =
          failure.kind === "rate-limited" ? "rate-limited" : "failed";
        this.save(record, {
          state: "failed",
          retryable: true,
          error: failure.message,
        });
        this.store.event("action.failed", `Not completed: ${record.summary}`);
      }
    }
    return record;
  }

  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    const ms = this.options.timeoutMs ?? 30_000;
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new ConnectorError(
                "ambiguous",
                "The request timed out before the service confirmed the outcome.",
              ),
            ),
          ms,
        );
      }),
    ]).finally(() => clearTimeout(timer));
  }
}
