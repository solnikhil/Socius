Tracking: [GitHub issue #3](https://github.com/solnikhil/Socius/issues/3). Companion: [Teams & Boards #2](https://github.com/solnikhil/Socius/issues/2).

## Assignment

Owner: **Teammate working on Skills & Connectors Marketplace** (name intentionally unspecified). The user owns all UI/refinement. This issue owner builds skill/registry/connector services, contracts and tests; provide setup/install states and payloads for user-owned screens. Completion still requires acceptance evidence.

## Outcome
Turn the curated catalog into a usable skills and bot-template ecosystem with standard Agent Skills packages, reviewed MCP connector discovery and one real authenticated connector. Preserve the two product categories **Skills & Connectors** and **Bots**, whether the catalog entry point is named Marketplace or Connect Apps.

## Winning workflow
A user imports a standard document-brief skill, reviews its source/version/dependencies/capability requests, installs it, connects Notion (preferred) or calendar and asks Socius for a source-backed brief. The bot reads permitted data and proposes a concrete page/calendar change. The user reviews the exact change and approves; it executes once and yields a visible result and activity record. Disabling the skill or revoking connector access prevents later use. A reusable bot template can be exported without private memory, chats or credentials.

## Existing foundation — reuse it
- Main branch baseline: d66fab5; strict skill/connector/bot manifests, exact dependency resolver and curated catalog.
- Reviewed install-plan digests, atomic bundled receipts and private bot instantiation exist.
- AI SDK chat loads installed curated instruction manifests; connector cards currently do not execute tools.
- Local API pairing/origin checks, SQLite persistence, OS-encrypted desktop provider keys and bot/memory approvals exist.
- **Missing:** standard SKILL.md directories, scoped connector credentials/tools, external registry verification, updates/uninstall and publication/export.
- Current install digest proves reviewed content consistency, not publisher authenticity.

Read: [AGENTS.md](https://github.com/solnikhil/Socius/blob/main/AGENTS.md), [architecture](https://github.com/solnikhil/Socius/blob/main/docs/architecture/v1.md), [local API](https://github.com/solnikhil/Socius/blob/main/docs/architecture/local-api.md), [README](https://github.com/solnikhil/Socius/blob/main/README.md).

## Ownership and integration contract
Own packages/marketplace, new packages/skills and packages/connectors, connector setup services and integration tests. The user owns catalog/install UI. Extend:
- packages/contracts/src/index.ts and app.ts: release/setup/action/receipt DTOs.
- packages/marketplace/src/index.ts and curated.ts: sources, compatibility and lifecycle.
- packages/runtime/src/store.ts: versioned installation, credential-reference, scope and approval records.
- packages/runtime/src/server.ts and model.ts: reviewed connector/tool broker.
- apps/web/src/views: user-owned catalog and installation/setup flows; supply documented endpoints, state transitions and response shapes.

The board issue owns packages/teams and orchestration. Coordinate edits to contracts, server.ts, model.ts and navigation. You are not alone: do not revert other owners' edits. A concurrent UI update may replace Marketplace.tsx with ConnectApps.tsx; inspect main rather than restoring the older layout.

Expose a typed action broker usable by single bots and board tasks. Include bot/board/run/task identifiers, installed release identity, capability/scope and validated arguments. This issue owns external-action policy and execution; callers cannot supply executable code or self-grant permissions.

## Deliverables
- [ ] Agent Skills SKILL.md directory import/export with YAML metadata validation, name/directory checks and progressive instruction/resource loading. Preserve compatibility metadata; allowed-tools requests never override runtime policy.
- [ ] Instruction-only V1 packages. Imported scripts remain inert; no arbitrary downloaded code or commands without a separate enforced-sandbox milestone.
- [ ] Immutable release identity, source, license, compatibility, digest, dependencies and trust status. Keep upstream MCP reverse-DNS identities separately from internal publisher/name IDs.
- [ ] Curated downstream MCP Registry adapter with cache, pagination/failures and reviewed server details. Discovery and previews must not spawn processes or connect with credentials.
- [ ] Inspect → review dependencies/permissions → verify integrity/trust → consent → stage safely → atomically install → configure. Reject path traversal/symlink escapes and unsupported executable entrypoints.
- [ ] Enable/disable, update, uninstall and rollback with persistent receipts. Permission expansion requires new consent; interrupted installs leave no active partial package.
- [ ] One real connector: Notion preferred, calendar acceptable if documented. Start read-only; then add one reviewed write flow. Use reviewed MCP setup and narrow tool schemas.
- [ ] Scoped per-user/per-account credential handling and secure OAuth/key setup outside chat. Reuse OS-backed encryption; explain reconnect/revocation states. Select Nango or an alternative only after checking fit; connector secrets do not become model context.
- [ ] Durable exact-action approvals binding arguments, actor, release identity and expiration; recheck scopes at execution. Denial/revocation/expiry blocks writes.
- [ ] Idempotency and reconciliation for retries, timeouts and ambiguous external responses. Do not promise exactly-once remote effects without provider support.
- [ ] Export reusable skills and bot templates from an explicit field allowlist. Review free text for private material. Human-reviewed local export/import is required; public hosted publishing can follow.
- [ ] Setup/detail UI that shows ready, authentication-required, disconnected, unsupported and failed states accurately.

## Verification and closing criteria
- [ ] Import a valid standard skill and reject malformed metadata, invalid names, path escapes and executable activation.
- [ ] Resolve exact dependencies; test missing/cyclic/conflicting versions, tampered content and expanded permissions.
- [ ] Complete the winning flow through the actual API/UI. Use fixture-based connector tests plus one controlled live integration with permitted test data.
- [ ] A restarted pending write still requires matching approval; tampering, expiry and revoked scopes fail.
- [ ] A rate limit or timeout does not cause an unbounded retry loop or blind repeat of an ambiguous write.
- [ ] Disable/uninstall/revoke prevents subsequent use, including requests from board/delegated tasks.
- [ ] Bot export omits live chats, memory, credentials, granted permissions and running routines; private text requires review.
- [ ] Provide screenshot/recording, test output, setup instructions, supported tool/account scopes, migrations and known limitations in the PR.

## Suggested PR sequence
1. Standard skill loader/import/export and local lifecycle.
2. Registry metadata/verification and setup-state APIs for the user-owned UI.
3. Real read-only connector and secure credentials.
4. Shared write broker/approvals, reconciliation and the complete acceptance flow.

Coordinate broker contracts with the board owner before implementation. Roster size does not change authority: this broker must work for teams larger than three. Public accounts/billing, paid skills and arbitrary executable plugins are separate later milestones, not dependencies of this issue.

## Agent setup
Clone the public repository, branch from latest main using codex/skills-connectors, read instructions and run:
```sh
npm ci
npm run check
npm run catalog:check
npm run build
npm run test:e2e
```
Use Node.js 24. Read installed AI SDK/MCP documentation and the current Agent Skills spec before using their APIs. Keep all secrets in local test configuration, never issue bodies/comments. Existing prompt text is not security enforcement; keep checks in the runtime. Open focused PRs referencing this issue; no assignee or deadline is invented.
