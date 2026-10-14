# Implementing the updated Notion stack

Source: [Socius Notion spec](https://app.notion.com/p/3f910c43ad3e81198b7bdf7be7bf6b06), fetched 2026-10-14 after its stack update. This plan incorporates the user's choices; it does not independently verify every linked vendor comparison, popularity claim, legal date or license statement.

## 1. Land the marketplace domain foundation

Implemented in this first work unit: private npm workspaces, strict skill/connector/bot manifests, two marketplace categories, dependency planning, a bundled main bot definition, private instance creation, tests and CI. The CLI checks this domain flow without pretending that a model, server or UI is running.

Next contract additions: immutable release digests, runtime compatibility, installation receipts, scoped grants and API events. Keep catalog metadata separate from upstream formats. Native Agent Skills imports map into Socius release metadata; MCP Registry names use their original reverse-DNS identity and need an explicit mapping rather than our internal publisher/name validator.

## 2. Settle the agent framework with an executable acceptance harness

Compare Mastra and Eve behind one `AgentRuntime` adapter contract. Use a deterministic fake tool/model where supported for repeatable recovery tests, then test actual Ollama and a chosen direct cloud model. Record framework version and full setup.

Required scenario: create a private main bot → run a read-only tool → propose a write → persist pending approval → kill/restart the process → rediscover the pending request → reject changed action parameters → approve the original action → execute once → return an artifact → cancel a delegated task. Test failures and uncertain writes, not just a clean response.

Mastra's current docs describe storage-backed suspended-run discovery; persistent storage is required. Its durable-agent crash recovery is configurable, so suspension support alone does not prove recovery of arbitrary running work. [Human-in-the-loop](https://mastra.ai/docs/agents/human-in-the-loop), [durable agents](https://mastra.ai/docs/harness/durable-agents). Eve also documents local workflow persistence. Neither framework removes the need for our authorization and side-effect reconciliation.

Deliverable: comparison results and an architecture decision, followed by one runtime adapter. Do not install both frameworks as permanent production dependencies simply to defer the choice.

## 3. Implement a shared UI and local service

React/TypeScript/Vite with Tailwind/shadcn consumes the local API. Ship chat, bot list, two marketplace tabs, detail/install preview, task progress, approvals and artifacts first. The runtime owns persistence and secrets; the UI only displays approved data. Use authenticated loopback requests, validate origins and pair phone clients before Tailscale exposure. Tailscale is a transport, not an application login.

Electron wraps the same interface. Use electron-builder/electron-updater as the updated spec requests, with secure main/preload boundaries, runtime supervision and safeStorage integration. Keep signing/notarization and update verification in release work; do not make packaging a dependency of the web/runtime acceptance flow. Node and native database/embedding dependencies need packaging tests on each release platform.

## 4. Adopt standard skills and connector discovery

Agent Skills use YAML frontmatter and Markdown in a directory's `SKILL.md`, with optional supporting resources. Import metadata for discovery, load instructions on activation and read resources as needed. Experimental `allowed-tools` is a request interpreted under Socius policy, never an authority override. [Specification](https://agentskills.io/specification).

V1 supports reviewed instruction skills. Imported scripts remain disabled because the updated scope postpones executable-plugin isolation. Skill installation does not automatically grant filesystem/network access.

Socius should act as a curated downstream aggregator of the official MCP Registry. Preserve upstream identity/version and package/remote references, then attach our trust review and setup metadata. The Registry is a metadata service in preview, not a code host or complete security scanner. Discovery must not launch a server. [Registry documentation](https://modelcontextprotocol.io/registry/about).

Start with one reviewed Notion or calendar integration. Nango is the candidate for OAuth integrations we own; Composio is an alternative requiring a data-routing/cost review before adoption. Keep connector auth behind a replaceable credential service.

## 5. Build inspectable memory before semantic retrieval

Markdown is the authoritative memory content. Each record needs a stable ID, scope, source references and modification revision; SQLite FTS5 is a derived search index. Saving and indexing must have a reconciliation strategy so external file edits and interrupted writes cannot silently diverge. Deletion clears searchable entries and cached context as well as the file. Separate bot, user and explicitly shared memory.

First acceptance: create a fact, restart, search it, edit the file externally, reindex, observe the corrected result, delete it and verify retrieval no longer returns it. Add sqlite-vec/EmbeddingGemma only after testing model distribution/license, target-machine performance, native packaging and rebuild behavior. Keep embedding versions so changing a model invalidates/rebuilds its index. Mem0/Hindsight remain future providers.

## 6. Add browser work and channels through the same broker

Browser abstraction: observation, proposed action, approval, execution and human takeover. Playwright provides deterministic browser operations and application tests. Stagehand can provide AI-driven action/extraction, but **v3 is CDP-based and removed Playwright as a dependency**; define explicit ownership of the browser/profile when using them together. Pin the assessed version rather than assume the document names the newest release. [Stagehand v3 architecture](https://www.browserbase.com/blog/stagehand-v3).

Avoid unrestricted autonomous browser batches that bypass per-action policy. Start with read-only navigation and extraction; add controlled writes and login handoff next.

Tailscale phone UI follows local API authentication. Telegram/grammY long polling is the first chat-channel candidate; map channel identities to paired users and reuse task/approval records. AgentMail or Autopilot Mail is a separate inbox integration. These channels cannot invent their own broader approval rules.

## 7. Add production services only when their flow exists

Langfuse/promptfoo follow a real runtime with redacted tracing and measurable evaluation scenarios. Sentry/PostHog remain opt-in; no automatic upload of prompts or personal artifacts. Choose Better Auth or Supabase Auth when the hosted registry data model is settled. Razorpay/creator payouts follow the free installation/publishing flow. Voice, India Stack, hosted search/parsing, push notifications and documentation hosting each get their own evidence-backed work package.

Provenance supports release verification, not permission consent or a malware guarantee. Injection scanners support defense, not authorization. Legal/compliance dates in the source are unverified by this implementation plan; review authoritative requirements before launching a hosted service rather than converting a comparison document into a compliance claim.

## Release gate

The first real slice is main bot → installed instruction skill → approved document access → summary artifact → visible activity history. Then add a separately scoped specialist bot and one connector action that parks for approval and survives restart. Marketplace payments, arbitrary executable skills and the optional cloud computer are separate milestones.
