# Team handoff

Start from `main`, run the README checks, and create a feature branch. Owners below are responsibility slots; assign actual teammates before starting. Contracts are shared infrastructure: changes require coordination with their consumers. Do not revert another owner's work.

## 1. Runtime and main bot

Own future `apps/runtime`, task persistence, policy integration and model adapters. Consume `@socius/contracts`; compare Mastra and Eve using the shared recovery/approval acceptance scenario, then adapt `socius/main` without baking framework types into catalog contracts.

Acceptance: one real tool-capable model completes a read-only task and returns an artifact; restart restores task history; an external action parks for approval and resumes only for the approved parameters; cancellation reaches child work. Demonstrate one Ollama and one direct cloud adapter before accepting the runtime framework. Fresh main-bot instances start with no permissions.

Depends on shared contracts. First PR should resolve the framework decision with reproducible evidence and document storage ownership. Second PR implements the main-bot flow.

## 2. Marketplace UI and bot workspace

Own future `apps/web`, catalog browse/detail views, bot list, chat and install previews. Reuse a responsive React UI for desktop and phone.

Acceptance: exactly two top-level marketplace tabs; skill/connector filters within the first; bot details show role, dependencies and requested permissions; installation creates a distinct private bot only after consent. Display pending authentication/unsupported-model states honestly. Handle empty/loading/error states and keyboard accessibility. No credentials or privileged device APIs in frontend state.

Depends on catalog contracts; browsing can begin against fixture data. Actual install/chat integration depends on authenticated runtime endpoints. Electron packaging is a later independent PR.

## 3. Registry and installation service

Own future `packages/installer` and `apps/registry`, release metadata, storage adapters, integrity verification, install transactions and rollback. Use `Catalog.planInstall` as domain input, not as proof of trust.

Acceptance: dependency graph shown before install; malformed/missing/cyclic/conflicting packages rejected; digest mismatch fails; permission expansion requests new consent; failed installs leave no active partial installation. Reject archive path escapes and unknown executable entrypoints. Installation consent does not grant all requested capabilities automatically. No user state or secrets in publication exports.

Depends on contracts; coordinate policy/installation receipts with runtime owner. Start with a curated local registry adapter; public publishing/auth is a separate deliverable.

## 4. Skills, connectors and memory

Own future `packages/connectors`, `packages/memory`, reviewed Agent Skills `SKILL.md` packages and connector setup. Choose the first useful connector with scoped API access. Implement Markdown memory files with SQLite FTS5 indexing; keep semantic retrieval behind a provider interface. Supermemory is superseded by the updated Notion stack.

Acceptance: one installed skill uses a real connector with reviewed scopes; login occurs outside chat; connector errors are inspectable and secrets redacted; memory has source, edit, export and delete paths. Revoking a capability blocks subsequent actions, including delegated and scheduled ones. A skill cannot increase its own authority.

Depends on runtime tool/policy contracts. Deliver skill content and connector configuration first; executable integration follows the broker interface.

## Integration order and completion

Contracts/catalog → runtime read-only main bot + catalog browse → reviewed installation → connector task + approval → specialist delegation → routines/remote control → desktop packaging/public registry.

First complete scenario: open Socius, inspect/install a summary skill, select a permitted document, ask the main bot to summarise it, inspect the artifact and activity record. Add a specialist template and verify its memory/permissions are separate. An external send requires an approval tied to the actual draft.

Every PR describes behavior, acceptance evidence and unresolved limitations. Run focused tests plus foundation checks. Completed integration work is committed and pushed to `main` as authorized; never force-push or silently bypass branch protection. API/schema changes land before dependent implementations. No estimated dates or owners are assigned here.
