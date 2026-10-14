# Team assignments and current status

Use Node.js 24, `npm ci`, then `npm run desktop`. The user owns UI/refinement. Two teammates own the backend workstreams. Their names are intentionally left unspecified.

## Ownership

| Owner                                               | Assignment                                               | Code boundary                                                                                                  | Current status                                                                                                                      |
| --------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Teammate working on Group chats                  | [Issue #2](https://github.com/solnikhil/Socius/issues/2) | Group-chat contracts, orchestration, persistence and tests                          | Assigned workstream; acceptance evidence still pending                                                                              |
| Teammate working on Skills & Connectors Marketplace | [Issue #3](https://github.com/solnikhil/Socius/issues/3) | packages/marketplace, new packages/skills and packages/connectors, installation/auth/action services and tests | Assigned workstream; acceptance evidence still pending                                                                              |
| You                                                 | [UI and refinement checklist](ui-refinement.md)          | apps/web/src plus desktop visual/presentation changes                                                          | UI refinement ongoing; new backend integration follows contracts                                                                    |
| Luna testing handoff                                | API-provider and chat reliability                        | Runtime adapter/test changes; Settings hint handed to you                                                      | Superseded by branch `model-enhancements` (multi-provider connections); the uncommitted drafts on main need no separate integration |

Issues [#2 specification](issues/teams-boards.md) and [#3 specification](issues/skills-connectors-marketplace.md) contain the full winning workflows, PR sequence and closure criteria. Agents can read the public repository/issues without Notion access. Do not guess GitHub assignees or dates.

## Completed and integrated

- Runnable Electron desktop shell and separate local runtime.
- Persistent main bot, user-created specialists, reviewed main-bot creation proposals and template installation.
- AI SDK streaming and provider adapters, bounded tasks/cancellation, SQLite history, scoped Markdown/FTS memory and exact-content approvals.
- Curated catalog previews/install receipts, text attachments and Markdown response export.
- OS-encrypted desktop credential bridge and backend activity records.
- UI messaging redesign with light/dark themes (42191fa); Activity tab removed and approvals reviewed inline (01347b7).
- Baseline checks passed before Luna's changes. Initial macOS unsigned package and restart flow were verified. This is not evidence of live OpenRouter inference or of completed issue #2/#3 workflows.

## In progress / draft evidence

Luna left uncommitted changes in:

- packages/runtime/src/model.ts: injectable provider fetch for tests, explicit retry budget and suppressed raw provider error logging.
- packages/runtime/test/model.test.ts: OpenAI/Anthropic/compatible boundary coverage plus an OpenRouter endpoint case.
- packages/runtime/test/runtime.test.ts: document-summary persistence, approved-memory restart/replay handling, cancellation and sanitized failure/retry tests.
- apps/web/src/views/SettingsView.tsx: OpenRouter model/endpoint/privacy hint; ownership is now yours.

Reported checks: baseline full check passed with 19 tests; targeted runtime tests passed with 10 cases; targeted model tests passed with 2 cases before the last OpenRouter addition. The final OpenRouter case, full checks/build/end-to-end flow and commit/push are still outstanding. No live API call was made and no provider connection was configured at that check. The testing agent is not currently executing this work.

## Remaining now

### Teammate: Group chats

Boards were retired on 2026-10-14. Group chats are the single collaboration surface; old board records are preserved and their bots remain available.

- [x] Shared threads, editable membership and attributed specialist replies.
- [x] Per-bot model selection and scoped skills, connectors and memory.
- [x] Group action approvals and cancellation.
- [ ] Refine group coordination, execution budgets and restart recovery as needed.

### Teammate: Skills & Connectors Marketplace

- [ ] Standard SKILL.md import/export and progressive loading.
- [ ] Enable/disable/update/uninstall, verified releases and safe staging/rollback.
- [ ] Curated MCP discovery and one real Notion/calendar connector.
- [ ] Scoped credential setup, exact-action approvals and external-write reconciliation.
- [ ] Documented API/setup states and acceptance tests; integrate with your Connect Apps UI.

### You: UI and refinement

- [ ] Polish chat, New Chat/bot management, Connect Apps, memory and settings.
- [x] OpenRouter Settings hint superseded: OpenRouter is a first-class provider in the Settings dialog (`model-enhancements`).
- [ ] Refine rich response/attachment states, inline approvals and error/empty/loading behavior.
- [x] Group chat screens: create/edit/delete, roster popover, attributed replies (replaces board screens).
- [ ] Accessibility, responsive behavior, visual consistency and final workflow review.

### Testing / integration next

- [ ] Run full checks on `model-enhancements` (runtime suites, build, end-to-end) before merging; Luna's drafts are superseded.
- [ ] Live check: connect OpenRouter (and one local provider) in Settings → Providers, add a tool-capable model, run Test, and chat; keys stay outside chat/issues.
- [ ] Live check: document summary, bot proposal and approved memory save.
- [ ] Commit/push the verified testing unit separately from unrelated UI work.
- [ ] Jointly verify the two issue workflows when backend and your screens are ready.

## Explicitly deferred / not assigned in the current two issues

Ollama testing is deferred at the user's request. LM Studio/llama.cpp checks can follow. Recurring routines/proactivity, browser automation/takeover, PDF/Office parsing, Tailscale/phone pairing, Telegram, public hosting/accounts/billing, signing/updates, agent email, semantic memory, voice, India Stack and optional cloud execution remain backlog items. Do not treat these as already assigned to the two teammates or required before your immediate UI refinement.

## Coordination rules

- You own UI; teammates deliver backend services and documented data/state contracts. Changes to shared runtime server/model/store and DTOs need coordination.
- Team owner owns board/run/task DTOs. Marketplace owner owns release/setup/action DTOs and the external-action broker. Neither owner gets sole ownership of all shared files.
- There is no hardcoded bot-count limit. Membership does not expand permissions; the execution queue enforces configured resource controls.
- Start branches from latest main: codex/teams-boards and codex/skills-connectors. User UI work can use codex/ui-refinement. Agent instructions and issue specs take precedence over stale screen names.
- Each PR gives current status, evidence, blockers and API examples. No fake production success and no secrets in comments.
- Keep Notion boxes unchecked until verified work is integrated. A teammate assignment is not implementation evidence.
- Integrate reviewed units to main as authorized; never force-push or accidentally commit another person's drafts.

## Checks

```sh
npm run check
npm run catalog:check
npm run build
npm run test:e2e
```

Controlled fixtures are test-only. Live model/provider checks are recorded separately. The project is ready for parallel work, but both major feature workflows remain unfinished.
