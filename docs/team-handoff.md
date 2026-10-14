# Teammate handoff

The runnable desktop base is on `main`. Use Node.js 24, `npm ci`, then `npm run desktop`. Configure a tool-capable model in Settings. Each teammate starts a `codex/<topic>` branch and opens a PR; ownership below is a workstream, not a named assignee.

## Implemented base

Electron shell and separate utility-process runtime; responsive React views; persistent main/custom/template bots; streamed AI SDK chat; user and model-proposed bot creation; reviewed curated installations; text attachments and Markdown response export; scoped Markdown/FTS memory; exact-content approvals; encrypted desktop model keys; activity log; tests and local packaging.

The user selected AI SDK for this release. Mastra/Eve are no longer prerequisites for beginning work. Persisted approvals survive restart; interrupted model runs require explicit retry. Full workflow checkpointing remains a future decision with its own acceptance tests.

## Workstream 1: connectors and action broker

Own new `packages/connectors` plus reviewed integration boundaries in `packages/runtime`. Coordinate changes to `server.ts` with the runtime owner.

First PR: one read-only Notion or calendar connector using MCP and a reviewed setup definition. Second PR: scoped OAuth/credential handling and a draft/write approval flow. No automatic launch of arbitrary commands discovered in registry metadata.

Acceptance: real read request succeeds; access revocation blocks later calls; secrets never appear in UI/activity; a proposed write shows exact parameters, survives restart, and executes only after matching approval. Ambiguous external outcomes are reconciled before retry. Add fixture-based integration tests and document one controlled live check.

## Workstream 2: skills SDK and marketplace registry

Own `packages/marketplace`, new skill import/export package and future curated-registry adapter. Coordinate manifest changes in `packages/contracts` before implementations depend on them.

First PR: Agent Skills `SKILL.md` directory import/export with metadata validation and progressive instruction/resource loading. Treat allowed-tools as requests; scripts remain disabled without an enforced sandbox. Preserve upstream MCP Registry identity separately from Socius IDs.

Second PR: immutable release metadata, publisher trust/signatures, version compatibility, atomic external package staging and rollback. Public publishing must export an explicit allowlist and require review of free text; never serialize a live bot.

Acceptance: valid instruction packages import; malformed manifests and path/symlink escapes fail; digest mismatch fails; updates that request more permissions require consent; uninstall removes the active capability; exported bots contain no private state or credentials.

## Workstream 3: runtime, delegation and routines

Own `packages/runtime/src/model.ts`, task lifecycle and future scheduling/delegation services. Keep UI DTOs in `packages/contracts` independent of SDK internals.

First PR: main bot delegates a bounded task to one enabled specialist with an explicit parent/child relationship, scoped context and budgets. Bot creation already works; delegation must be a separate operation.

Second PR: durable routines with disabled-by-default schedules, missed-run policy and cancellation. Evaluate checkpointing versus explicit interrupted-run recovery with controlled crash tests before changing current behavior.

Acceptance: delegated work cannot gain permissions from its parent; cancellation propagates; restarted jobs cannot repeat external writes blindly; approval revocation works across scheduled/delegated calls; one routine survives restart and records outcomes. Test model/tool capability discovery rather than assume every model supports tools.

## Workstream 4: interface, browser and release

Own `apps/web/src/views` and `apps/desktop`; share UI primitives in `apps/web/src/components`. Coordinate browser tool registration with the action-broker owner.

First PR: refine bot management, document parsing/attachment UX and response rendering; add supported model discovery and connection diagnostics. Extend the existing browser tests.

Second PR: reviewed browser observation/actions and human takeover using Playwright and a pinned Stagehand driver. Do not allow autonomous action batches to bypass policy. Stagehand v3 is CDP-based, not built on Playwright.

Release PRs: platform-specific installers, signing/notarization, verified update channels and phone pairing/Tailscale. The current app directory is unsigned. macOS runtime behavior is tested locally; Windows/Linux release verification remains required. Keep telemetry opt-in.

Acceptance: one document-to-summary flow works with actual parsing; login handoff keeps secrets outside chat; consequential browser steps require exact review; packaged app starts on each supported OS; phone sessions require application pairing as well as tailnet access.

## Shared checks and integration

```sh
npm run check
npm run catalog:check
npm run build
npm run test:e2e
```

Browser tests use a deterministic model fixture only in `e2e/server.ts`; production never selects it. The runtime adapter test exercises real AI SDK streaming/tool handling through a controlled compatible endpoint. Actual provider access must be tested separately.

Every PR states the outcome, acceptance evidence and remaining limitations. Keep contract edits coordinated, never revert another owner's work, and do not force-push. Completed integration work is committed and pushed to `main` under the user's authorization. Human teammate branches remain separate until deliberately integrated.
