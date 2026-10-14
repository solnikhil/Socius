Tracking: [GitHub issue #2](https://github.com/solnikhil/Socius/issues/2). Companion: [Skills & Connectors #3](https://github.com/solnikhil/Socius/issues/3).

## Assignment

Owner: **Teammate working on Teams & Boards** (name intentionally unspecified). The user owns all UI/refinement. This issue owner builds the backend, orchestration, contracts and tests; agree payloads with the user before UI integration. Completion is based on acceptance evidence, not assignment alone.

## Outcome
Build persistent project boards where Socius and user-selected specialist bots collaborate, expose useful progress, and return one consolidated result. **Remove the three-bot product limit: a team can contain any number of bots.** Membership size is separate from configurable execution concurrency and resource budgets.

## Winning workflow
A user creates a Research board, adds Socius plus Researcher, Writer and Reviewer (four members), attaches sources and requests a brief. The coordinator assigns work, specialists contribute attributed results, the reviewer identifies unsupported claims, and the coordinator returns one source-backed artifact. The user can inspect tasks, interrupt work and resume the workspace after restarting. The same design works with a larger roster.

## Existing foundation — reuse it
- Main branch baseline: d66fab5; runnable Electron + React/Vite, separate local runtime and SQLite persistence.
- AI SDK ToolLoopAgent, streamed chat, persistent bot instances, manually created specialists and reviewed main-bot creation already exist.
- Capability-gated private Markdown/FTS memory, exact-content bot/memory approvals and cancellation exist.
- **Not yet implemented:** board records, shared team chat, delegation, multi-bot scheduling or automatic checkpoint recovery.
- No framework migration is required. Keep the AI SDK adapter replaceable.

Read: [AGENTS.md](https://github.com/solnikhil/Socius/blob/main/AGENTS.md), [architecture](https://github.com/solnikhil/Socius/blob/main/docs/architecture/v1.md), [local API](https://github.com/solnikhil/Socius/blob/main/docs/architecture/local-api.md), [README](https://github.com/solnikhil/Socius/blob/main/README.md).

## Ownership and integration contract
Own a new packages/teams module, board/team DTOs, team runtime services and orchestration tests. The user owns board views and visual integration. Start from:
- packages/contracts/src/app.ts and index.ts: extend DTOs/schema without importing SDK types.
- packages/runtime/src/store.ts: versioned board/member/task/run persistence and migrations.
- packages/runtime/src/model.ts: bounded specialist invocation through existing model adapter.
- packages/runtime/src/server.ts: authenticated board/team endpoints.
- apps/web/src/views and components: user-owned board switcher, roster, shared thread and task/result views. Provide documented payloads/events; coordinate changes rather than editing these views independently.

The marketplace issue owns packages/marketplace, skill loading and packages/connectors. Coordinate edits to contracts, server.ts, model.ts and app navigation. You are not alone in the codebase: preserve other changes and adapt to concurrently merged PRs. The catalog UI may be renamed ConnectApps by concurrent work; inspect current main before editing it.

Agree a broker boundary first: team execution submits a typed tool/action request containing bot ID, board/run/task ID, release identity and arguments. The connector workstream owns external-action execution/approvals. Team code must not implement a second authorization engine.

## Deliverables
- [ ] Persistent boards with objective, completion criteria, members, explicit coordinator, shared context references, tasks, decisions, results and archival.
- [ ] Add/remove existing private bots, edit roles and select a coordinator. No hardcoded roster cap in UI, schema, API, scheduler or tests. Define what membership changes during an active run mean.
- [ ] Shared attributed thread with user messages, contributions, concise decision summaries, blockers and one final synthesis; avoid repetitive chatter.
- [ ] Task board: Backlog, Ready, Working, Needs input/Review, Done; retain failed/cancelled history. Explain outstanding work rather than pretending a run succeeded.
- [ ] Coordinator proposes a bounded task graph, assigns specialists and collects results. Prevent circular delegation, recursive self-triggering and uncontrolled debate.
- [ ] Configurable concurrent executions, step/time/output/spend budgets and a queue. Large teams queue rather than fail because of roster size. Surface exhausted budgets.
- [ ] Stop team/run/task controls; cancellation reaches active children and prevents queued work from starting.
- [ ] Explicit board sharing: selected sources and results are shared; private bot memory/credentials are not pooled or copied. Use least context needed per task.
- [ ] Recheck each bot's permissions at execution. Coordinator status and parent delegation confer no extra authority.
- [ ] Persist run/task/approval references. Implement and document safe restart behavior: checkpoint if proven, otherwise explicit interrupted states and user-driven retry; never blindly replay uncertain external writes.
- [ ] Responsive, accessible empty/loading/error/reconnecting views plus inspectable activity.

## Verification and closing criteria
- [ ] Four-member and larger-roster tests pass; no fourth-bot rejection exists.
- [ ] With concurrency set below roster size, every eligible task eventually executes and the concurrency ceiling holds.
- [ ] Complete the winning workflow with deterministic test models through the real API/UI; include a controlled live-model check when provider access is available.
- [ ] Prove private memory isolation and that a child cannot borrow parent/coordinator permissions.
- [ ] Test duplicate dispatch, specialist failure, budgets, membership changes, pending approval, cancellation and restart.
- [ ] A cancelled run cannot produce a misleading completed result or start queued children.
- [ ] Provide screenshot/recording, test output, schema/migration notes, API examples and limitations in the PR.

## Suggested PR sequence
1. Contracts, persistence and authenticated board CRUD with example payloads for the user-owned UI.
2. Team queue/delegation and progress; four-member acceptance flow.
3. Scoped tools/approval integration and restart/cancellation coverage; integrate with the user’s UI and verify the combined flow.

Connector integration is not required for the first read-only board flow. External-write acceptance depends on the shared broker from the marketplace issue. Keep boundaries usable so the two workstreams can land independently.

## Agent setup
Clone the public repository, branch from latest main using codex/teams-boards, read repository instructions and run:
```sh
npm ci
npm run check
npm run catalog:check
npm run build
npm run test:e2e
```
Use Node.js 24. Read the installed AI SDK's version-matched docs before changing its APIs. Test fixtures belong only in tests; never add fake production responses. Use personal test accounts and local credential storage, never issue comments for secrets. Open focused PRs referencing this issue; leave names/dates unassigned until the human team chooses them.
