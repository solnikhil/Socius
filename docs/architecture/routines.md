# Routines: scheduling, durable execution and quiet proactivity

Status: runtime, persistence, DTOs, API and automated tests implemented on `codex/scheduling-durability-proactivity` for [Issue #10](https://github.com/solnikhil/Socius/issues/10) (A03, A04, A05). Not yet reviewed or integrated into `main`. There is no routine UI; the user owns those screens and this document lists the hooks for them. No live provider run has been recorded.

## Decision

Socius uses **one routine engine** (`packages/runtime/src/routines/engine.ts`) with Socius-owned contracts (`@socius/contracts/routines`) and SQLite tables. No workflow framework was adopted: the requirements (fenced ownership, checkpointed steps, exact-action approvals through the existing broker) fit in roughly a thousand lines and keep authorization in one place. Briefs, watchers and goal follow-ups are kinds of routine work on this engine, not separate schedulers. Dreaming (#8) stays separate; it can reuse the lease, budget and cancellation hooks below but is not implemented or enabled here.

## Records

| Table                   | Holds                                                            | Notes                                                                    |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `routines`              | Private definitions (`Routine`)                                  | Never part of a bot template or export                                   |
| `routine_runs`          | Logical runs (`RoutineRun`) with their attempts                  | `UNIQUE(routine_id, occurrence_key)` makes claims atomic                 |
| `routine_steps`         | Checkpoints (`RunStep`)                                          | Bounded text output only; no closures, credentials or SDK state          |
| `routine_state`         | Watcher baselines and the suppressed-notice key (`WatcherState`) | Separate from execution                                                  |
| `routine_notifications` | In-app inbox (`RoutineNotification`)                             | `UNIQUE(dedupe_key)`; `deliver_at` holds items during quiet hours/snooze |
| `runtime_lease`         | One owner, a monotonically increasing fence, an expiry           | Single-runtime execution lock                                            |
| `records` (`task`)      | Each attempt also creates a chat `Task` with `routineRunId`      | Existing approval/action UI links by task ID                             |

Migration 6 adds these tables. Existing chats, approvals, memories, providers and historical board records are untouched.

## Definitions and enablement (A03)

- A routine belongs to one private bot and has a user-supplied task (`work`), `schedule`, IANA `timezone`, `missedRuns`, `limits` and `notifications`. Creating, editing or deleting never enables it; `POST /api/routines/enable` does, and only that. Enabling grants no tools, permissions or connector access: every run uses the bot's grants at the time it runs.
- Schedules: `once` (local date + time), `interval` (every 15 minutes to 7 days from a UTC anchor; omitted anchor = one interval after saving), `daily` and `weekly` (local time). Invalid input returns `400` with field diagnostics such as `schedule.time: Use 24-hour HH:MM` or `timezone: Unknown IANA time zone`. One-time schedules in the past and goal end dates in the past or beyond 90 days are rejected.
- Execution instants are UTC; the time zone is stored separately. `next` and `POST /api/routines/preview` show upcoming occurrences with local times and plain notes.

### Time rules

- **Occurrence identity.** Wall-clock schedules are keyed by local `YYYY-MM-DDTHH:MM`; intervals by UTC instant. Keys are unique per routine across every revision, so a repeated hour, time-zone edit or clock change cannot run the same occurrence twice.
- **DST gap** (local time does not exist): runs the same distance after the gap, e.g. 02:30 → 03:30.
- **DST repeat** (local time happens twice): runs at the first instance only.
- **Time-zone or schedule edits** never turn elapsed time into missed runs. An occurrence already claimed in the old zone (same local date and time) does not run again in the new one.
- **Clock moved backwards**: recorded occurrences do not repeat; an activity event notes it. **Clock moved forwards**: the elapsed occurrences are handled by the missed-run policy.

### Missed runs

An occurrence started within the 5-minute grace period is on time. Otherwise it is missed.

- `skip` (default): missed occurrences become one `skipped` run record covering all of them (`covers.count`, first and last time) with the reason. If the latest one is on time, it still runs.
- `run-once` with `maxDelayMinutes` (default 12 h, at most 7 days): missed occurrences younger than the limit coalesce into one `catch-up` run; older ones are recorded as skipped. There is never more than one queued run per routine.
- A queued run that waits past its policy (for example across sleep) is skipped instead of running late; manual runs wait up to 24 hours.
- Routines run only while Socius's runtime is open and the host is awake. There is no OS wake, closed-app execution or cloud worker.

### Queue, fairness and overlap

- At most one queued or running run per routine: an occurrence that arrives while the previous run is active is recorded as skipped (overlap). A run waiting for approval does not block the next occurrence.
- Global concurrency 2, reduced to 1 while any foreground chat or group reply runs. A bot's routine never starts while that bot has foreground work, and routine attempts never block chat with that bot. Runs start oldest first, one per bot at a time. At most 50 runs may be queued; further occurrences are skipped and recorded.
- Per-routine limits: attempt timeout (default 180 s), attempts per run (default 2; a graceful shutdown does not use one), runs per rolling 24 hours (default 24, scheduled and manual together), stored output characters (default 6,000). Per-provider token accounting does not exist yet (roadmap O01); these limits are the current budget hook.

### Operations and their effect on work

| Operation       | Queued run   | Running attempt                     | Awaiting approval                  |
| --------------- | ------------ | ----------------------------------- | ---------------------------------- |
| Disable (pause) | Cancelled    | Finishes                            | Stays; proposals remain reviewable |
| Edit            | Cancelled    | Aborted and cancelled               | Stays; proposals remain reviewable |
| Finish / stop   | Cancelled    | Finishes; no later occurrences      | Stays                              |
| Cancel run      | Never starts | Aborted; late results are discarded | Pending proposals become `blocked` |
| Delete routine  | Removed      | Aborted                             | Proposals blocked; history deleted |
| Delete bot      | Removed      | Aborted                             | Proposals blocked; history deleted |

Run now (`POST /api/routines/run`) is the explicit manual-run request. It works on a disabled routine but not a finished one, refuses overlap, counts toward the daily limit, and runs with the same scope, grants and approval rules.

### History and retention

Each run records trigger, routine revision, scheduled/due/start/end times, attempts (task ID, fence, outcome, error), model, state, reason, bounded result, action IDs and notification ID. Prompts are not copied into activity events or logs; activity events name the routine only. Terminal runs are kept for 90 days and at most 200 per routine; checkpoints of terminal runs for 7 days; read notifications for 30 days. Deleting a routine deletes its runs, checkpoints, state and notifications. Broker action records and tasks follow their own retention.

## Durable execution (A04)

### States

`queued → running → completed | awaiting-approval | failed | blocked | cancelled | interrupted`, plus `skipped` for occurrences that never started. `awaiting-approval → completed` once every proposal from the run is resolved (`succeeded`, `denied`, `expired`, `blocked` or `failed`; a proposal left untouched past its approval window counts as expired); a proposal whose outcome is `unknown` keeps the run waiting with a reason until the user checks it. A logical run has attempts; an attempt has steps.

### Checkpoints

A run is a sequence of named steps: `model` (one model call), `observe` (one reviewed connector read), `judge` (a watcher's model judgement). Before a step runs, a `started` checkpoint is committed; after it, the bounded output is committed as `completed`. On resume a completed step is returned from its checkpoint and never re-executed. A step that started but did not complete is recomputed: model calls and reads have no external effect.

Delivery, watcher baseline update, task status and run completion are committed in **one transaction**, so a crash either leaves all of them undone (the resumed run recomputes or reuses checkpoints and delivers once, deduplicated by key) or all done.

### Ownership and fencing

A runtime takes the `runtime_lease` row on its heartbeat (every 15 s, 60 s lifetime). Renewal keeps the fence; any new acquisition, including the same runtime after its lease lapsed during sleep, increments it. Every worker commit runs inside `BEGIN IMMEDIATE` and first checks owner, fence and expiry; a stale worker's commit throws and writes nothing. A second runtime on the same workspace stays on standby until the lease expires, or immediately if the previous owner's process on this host is gone. A lapsed epoch aborts its own in-flight attempts without waiting for them, so a hung provider call cannot stall scheduling.

### Recovery

When a runtime gains a new fence it recovers runs left `running`: the attempt is marked `interrupted` and its task failed. The run then resumes (requeued, reusing checkpoints) if the routine still exists at the same revision and attempts remain; it becomes `cancelled` if the routine changed and `interrupted` if no attempts remain. Chat tasks keep their documented behavior: interrupted chat tasks fail and need an explicit retry. Routine runs differ because every step is idempotent by construction.

Invalidation at the start of every attempt: deleted or edited routine (cancelled), disabled routine for scheduled runs (cancelled), deleted bot (blocked), no usable model (blocked, setup needed). Grants, installation, enablement, release, connection state and group membership are not cached: they are checked by the model context and the broker at the moment of each call.

### External effects

- Every tool call in a routine uses the existing model context and **action broker**, with actor `{botId, taskId, runId: "routine:<run id>"}`. There is no second authorization path. Writes always become exact-action proposals; a routine never writes without the user approving that exact proposal.
- Approvals survive restart (they are broker records), stay bound to exact parameters, release, connection, actor and expiry, and never become routine-wide approval: each run proposes afresh.
- When a resumed attempt repeats a model step, the same exact change from the same run is reported back to the model instead of being proposed again; an already-succeeded change is reported as done and not repeated. Changed content is a new proposal.
- The broker persists intent before dispatch. An approved write interrupted by a crash becomes `unknown` and is reconciled with `POST /api/actions/check`, never replayed. Exactly-once external delivery is not promised.
- A cancelled or deleted run's pending proposals are blocked, and a broker guard rejects approval or retry for them afterwards.
- Retries: only failures known to be safe (rate limited, unreachable, provider timeout or server error, empty output, a failed read) are retried automatically, with exponential backoff from 1 minute, within the attempt limit. Setup problems (credentials, model, grants, installation, connection) block the run. Ambiguous writes are never retried by the routine.

## Quiet proactivity (A05)

- **Briefs** (`work.kind: "brief"`): an explicit scheduled delivery. A reply of exactly `NOTHING_TO_REPORT` is not delivered unless `deliverEmpty`.
- **Watchers** (`watcher`): one reviewed connector **read** chosen at creation (validated against the reviewed action's input schema; write actions are rejected), performed by the runtime itself through the broker. The normalized content's SHA-256 is compared with the last notified baseline. The first observation is the baseline and is silent. An unchanged result is silent. A change produces one `change` notification with source links and observation time, unless an optional `prompt` lets the bot judge it: `NO_MEANINGFUL_CHANGE` acknowledges it silently. A cooldown (`cooldownMinutes`) coalesces changes into one later update. A failed read, or a read that returned no body, is a failure, never an empty result or a change; the baseline is untouched. Watchers without a prompt never call a model.
- **Goal follow-ups** (`goal`): finite by construction, with an end date (at most 90 days) and `maxFollowUps` (at most 30). They stop when either bound is reached, when the user calls `finish`, or when the bot starts its reply with `GOAL_COMPLETE`. A finished routine never runs again, including after restart.
- **Notification policy**: `meaningful` (default) delivers results, changes, completion, failures and approval requests but not unchanged checks; `every-run` also delivers unchanged results; `never` keeps history only. A notice for the same failure or setup problem is delivered once until a run succeeds; every failed run stays in history. Quiet hours (local) and snooze hold delivery until they end; mute suppresses delivery while checks continue.
- **Inputs**: only the bot's permitted context and installed, connected, reviewed read adapters. Missing access is a `blocked` run with a setup notice. A watcher can describe a next step; any external change still needs the existing exact-action approval. Observation consent never becomes write authority or wider sharing. Bots cannot create routines: there is no routine tool, and `routines.manage` is not granted anywhere.
- **Delivery** is in-app only (`GET /api/routines` notifications). Email, Slack, WhatsApp, Telegram and phone push are not implemented.

## UI integration hooks (for the user)

- `GET /api/routines?botId=` returns routines (with `next`), recent runs, delivered notifications and scheduler status for a Routines/Activity surface.
- Approval cards already appear in the bot's direct chat: routine proposals are broker actions whose actor is the bot. `run.actionIds` links them to the run.
- Routine attempts are `Task` records with `routineRunId`; UI "bot is replying" checks must exclude them (done in `App.tsx` and `Chat.tsx`).
- Suggested controls: create → preview → enable switch, run now, cancel run, pause, snooze, mute, stop goal, delete, notification inbox with mark-read.

## Not implemented

Routine UI and browser acceptance flow; group-chat routines (a routine runs one private bot; group delegation stays in the group runtime); live provider or account checks; per-token usage accounting and monthly caps (O01); OS wake, closed-app or cloud execution; outbound channels; new connectors; public or shared routine templates; Dreaming.
