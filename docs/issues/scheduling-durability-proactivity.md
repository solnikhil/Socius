# Scheduling, durable execution and proactivity

Tracking: [Issue #10](https://github.com/solnikhil/Socius/issues/10).

Status: specification and assignment handoff only. Owner: unassigned; the user will assign this work. No implementation is claimed by this document.

## Outcome

Deliver the three roadmap items as one coherent workstream:

- [ ] **A03 — Scheduling:** disabled-by-default routines, persisted schedules, missed-run policy and run history.
- [ ] **A04 — Durable execution:** choose checkpoint/resume behavior with controlled crash tests; preserve approval requirements.
- [ ] **A05 — Proactivity:** morning briefs, watchers and goal follow-ups with quiet/no-change behavior.

A user explicitly enables a private bot's routine, sees when it will run, receives useful results when appropriate, and can inspect, pause or cancel it. Restarting Socius neither loses pending work nor blindly repeats external effects. Unchanged watcher state does not generate repetitive messages.

## Existing foundation and boundaries

Read [AGENTS.md](../../AGENTS.md), [architecture](../architecture/v1.md), [local API](../architecture/local-api.md), [connector/action broker](../architecture/skills-and-connectors.md) and [team handoff](../team-handoff.md).

Current main already has private bots, provider selection, SQLite state, chat/group tasks, cancellation, exact-content approvals and a connector action broker. On restart, interrupted chat tasks become failed and executing external writes become unknown; these controls are not general checkpoint/resume or recurring scheduling. Bot instances start with routines disabled. A general routine engine and proactive watcher service are not implemented.

[Dreaming #8](https://github.com/solnikhil/Socius/issues/8) and [draft PR #9](https://github.com/solnikhil/Socius/pull/9) are separate. Coordinate scheduling/cancellation/provider-budget hooks, but this workstream must not implement a second dreamer, silently enable memory consolidation, or require that unmerged draft to run. Group chats are the only collaboration surface; historical board records must remain untouched and board execution/UI must not return.

The user owns UI and visual refinement. The assignee owns runtime services, persistence, DTOs, policy integration, tests and documented hooks for focused user-approved UI integration. Coordinate contracts/server/store/model changes with other workstreams. You are not alone in the repository: preserve concurrent work. No framework migration is required; document the chosen execution architecture rather than assuming a new framework is necessary.

## A03 — Scheduling

- [ ] Persist private routine definitions: owner/private bot ID, user-approved task, schedule, timezone, enabled flag, configuration revision, missed-run policy, limits, notification policy and next occurrence. Keep run occurrences/attempts separate from definitions and public bot templates.
- [ ] Support one-time, interval and timezone-aware daily/weekly schedules through validated contracts; invalid/ambiguous schedules fail with useful diagnostics. Store execution instants in UTC and IANA timezone separately. Specify DST skipped/repeated local times, timezone edits and system clock changes; never accidentally double-run a wall-clock occurrence.
- [ ] New/imported routines are disabled. Creating or editing a routine must not implicitly enable it. Show a next-run preview and require explicit enablement; enabling a routine does not grant any tools or external-write authority.
- [ ] Define and implement missed-run behavior for sleep, app closure, offline providers and restart. Safe default: skip elapsed occurrences and record them. An explicitly chosen catch-up policy is bounded, coalesces missed work rather than flooding the queue, and has a documented grace period. Persist policy decisions and reasons in history.
- [ ] Persist occurrence identity and claim it atomically so duplicate ticks/restarts cannot create concurrent executions for the same occurrence. Bound global/per-bot concurrency and queue length, prefer foreground chat, and define fairness and overlapping-run behavior.
- [ ] Provide create/read/edit/delete/enable/disable, run-now and cancel operations through the paired/origin-checked API. Run-now obeys the same scope, budget and approval rules and cannot bypass a disabled routine's policy without an explicit manual-run request.
- [ ] Define what pause, disable, edit and delete do to queued, running and awaiting-approval work. Cancellation must stop children, prevent queued actions from starting and block late completions from reporting success. Archive history according to a documented retention/deletion policy.
- [ ] Record scheduled/due/start/end timestamps, trigger, routine revision, task/group references, attempt count, model, status, skip/block/failure reason and redacted result/artifact references. Surface pending approvals and next run through stable DTOs; credentials and full private prompts stay out of logs.
- [ ] Local execution is available only while Socius's runtime is open and the host is awake. Persist overdue work for the selected recovery policy; do not claim OS wake, closed-app work or cloud availability.

## A04 — Durable execution

- [ ] Write an architecture decision defining checkpoint boundaries, resume versus explicit retry, storage ownership and state transitions. Use Socius-owned contracts independent of any workflow framework. Address existing chat/group tasks without silently changing their documented retry behavior.
- [ ] Persist states such as queued, running, awaiting approval/user, completed, failed, cancelled, skipped and interrupted/unknown where appropriate. Distinguish logical runs, attempts and steps; record recovery decisions and references to durable approval/action records.
- [ ] Save safe input/revision references and completed step results before advancing checkpoints. Do not serialize closures, credentials or arbitrary SDK state. Define invalidation for edited/deleted routines, removed bots/models, changed group membership, disabled packages and revoked grants.
- [ ] Use durable ownership/leases and stale-worker fencing, or an equivalent proven mechanism. Expired workers cannot commit results or dispatch actions after another worker has taken ownership. Prevent concurrent owners across two runtime processes, or enforce a tested single-runtime ownership lock explicitly.
- [ ] Every resumed or scheduled tool action uses the existing policy/action broker, with current actor, bot, installation/release identity, grants and connection state. Do not add a second authorization path. Group delegation uses the existing group runtime and each member's own permissions and budgets.
- [ ] Pending approvals survive restart, stay bound to exact parameters/release/actor/expiry, and never turn into broad routine approval. Expired, denied, changed or revoked actions remain blocked. Reuse the durable identity of a previously approved exact action only where policy permits; changed content requires fresh approval.
- [ ] Do not rerun completed effects when replaying computation. Persist external intent before dispatch. Use stable action identities and provider idempotency where supported; uncertain outcomes remain unknown and require reconciliation through the existing broker. No promise of exactly-once external delivery without service support.
- [ ] Bound retries, exponential backoff, elapsed time, steps, output and provider usage. Retry only known-safe failures; ambiguous writes cannot be retried automatically. Cancellation and revocation reach active steps and are rechecked before effects.
- [ ] Controlled crash tests cover claim, checkpoint, model/tool dispatch, approval wait, remote success before local acknowledgement, checkpoint advancement and result delivery. Demonstrate no lost completion, duplicate user delivery or blind external replay across restart.

## A05 — Proactivity

- [ ] Build explicit opt-in morning briefs, scoped watchers and finite goal follow-ups on the same scheduler/durable execution services. Define persisted watcher baselines and goal completion/stop conditions. No hidden open-ended jobs or self-created recurring work.
- [ ] Inputs come only from bot-permitted context and installed, connected, reviewed read adapters. Missing access produces a setup/block state, never an invented observation. No arbitrary web/browser/file execution or new connector implementation is implied by this issue.
- [ ] Persist notification state separately from check execution. Default to quiet while results are unchanged or non-actionable; notify only on a meaningful change, completion, failure or required user action. Morning briefs are an explicit scheduled delivery, so state their separate cadence/empty-content policy clearly.
- [ ] Use deterministic change keys/baselines, meaningful thresholds, cooldowns, coalescing and delivery deduplication. A failed/partial fetch must not be treated as an empty result or a meaningful change. Updating a baseline and recording a delivery must recover safely after a crash.
- [ ] Define quiet hours/timezone behavior, snooze/mute, stop, frequency controls and bounded follow-up duration. Goal completion stops subsequent follow-ups, including after restart. Suppress repeated identical failure/setup notices while keeping the failure visible in run history.
- [ ] Deliver first through an inspectable in-app result/notification surface, with source links, observed time, changes and stop controls. Coordinate its design with the user. Outbound email/Slack/WhatsApp/Telegram and phone push require separately supported channels and explicit authorization; they are not delivered by this issue.
- [ ] A watcher can report a proposed next step, but any consequential external action still needs the existing exact-action approval. Proactivity cannot turn observation consent into write authority or expand private/group sharing.

## Work packages / suggested PR sequence

1. **Contracts and architecture:** execution decision record, routine/occurrence/run/step/watcher DTOs, migrations, policy defaults and API examples; agree shared hooks before implementation.
2. **Scheduling foundation:** CRUD/enablement, timezone handling, queue/claims, run history and missed-run policies with a controllable clock.
3. **Durable execution:** checkpoint recovery, fencing/ownership, action/approval integration, cancellation and crash tests.
4. **Proactive workflows:** morning briefs, watchers, finite goals, quiet/no-change behavior and crash-safe delivery/baselines.
5. **User integration and acceptance:** focused controls, browser/API workflows, documentation, Notion status and a reviewed integration PR.

Work can be divided between assignees after the shared contract is agreed; avoid independent schedulers or competing task state machines.

## Winning workflow

Create a daily morning brief routine for a private bot and verify that it stays disabled. Choose timezone and missed-run policy, inspect the next occurrence, then explicitly enable it. Run a scoped watcher and a goal follow-up through the same engine. An unchanged check stays quiet; a meaningful change produces one in-app update. Stop the runtime around a checkpoint and restart: completed work is reused, pending approval remains pending, and an ambiguous external outcome is reconciled without replay. Complete/cancel the goal and confirm no later follow-up is dispatched.

## Verification and closure criteria

- [ ] Deterministic clock tests cover due/not-due, one-time/interval/daily/weekly, DST, timezone/clock changes, missed runs, bounded catch-up, overlap, fairness and duplicate ticks/process ownership.
- [ ] Fresh and migrated workspaces preserve existing chats, approvals, memories and historical board records. All new routines remain disabled until explicitly enabled.
- [ ] Fault-injection/restart tests prove checkpoint recovery, fencing, approval preservation/expiry, cancellation, revision invalidation and safe unknown-effect reconciliation. Include failure after remote success but before local acknowledgement.
- [ ] Watcher tests cover unchanged, actionable change, empty/partial/error results, quiet hours, cooldown, deduplication, failure-notice suppression, completion and cancellation across restart.
- [ ] Runtime enforcement tests cover cross-bot/group isolation, revoked grants, disabled/uninstalled packages, removed provider/model, disconnection, budget exhaustion and forged/stale approval/action references.
- [ ] API and browser acceptance cover create → preview → enable → run/history → awaiting approval → restart → inspect/resume or safely block → pause/cancel/delete. Verify an unchanged watcher causes no new user-facing message.
- [ ] Run `npm run check`, `npm run catalog:check`, `npm run build`, `npm run test:e2e`. Record environment limitations and live checks separately from deterministic fixtures; no fabricated success.
- [ ] Document an explicitly consented live brief/watcher result where supported provider/account access exists. If unavailable, leave live acceptance unchecked and document the blocker.
- [ ] Update README, architecture/API/decision record, team handoff and Notion A03/A04/A05 plus I05 to reflect actual integrated behavior. Keep boxes unchecked until verified integration.
- [ ] Deliver on `codex/scheduling-durability-proactivity` or another agreed `codex/<topic>` branch with reviewed PRs and acceptance evidence. Do not force-push or overwrite unrelated work. The user assigns the issue; do not guess people or deadlines.

## Out of scope

Dreaming implementation; public or shared routine templates containing private state; cloud workers/sync; OS wake or keeping a sleeping laptop running; browser automation; new external delivery channels; arbitrary plugins; new connector adapters; restoration of boards. A03/A04/A05 do not by themselves complete those roadmap items.
