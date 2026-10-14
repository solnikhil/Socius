# Socius

A desktop AI ally with a persistent main bot, private specialist bots, editable local memory, and a **Connect Apps** catalog of skills, connectors and bot templates. Light and dark themes follow the system or a saved preference.

## Start the desktop app

Use Node.js 24 and npm. The first Electron launch downloads the official runtime.

```sh
npm ci
npm run desktop
```

Open Settings (account menu or ⌘,). It floats over the workspace. Under **Providers**, connect one or more of 29 AI SDK providers: Ollama, LM Studio, llama.cpp and any OpenAI-compatible server; OpenAI, Anthropic, Google Gemini, Mistral, xAI, Groq, DeepSeek, Cerebras, Fireworks, Together AI, Perplexity, Cohere, DeepInfra, Baseten, Hugging Face, Moonshot AI, Alibaba Qwen, MiniMax and Z.ai; Azure OpenAI, Amazon Bedrock, Google Vertex AI and Claude on Vertex; and the Vercel AI Gateway and OpenRouter. Several accounts per provider are allowed. Under **Models**, add models from each connection's live model list (where the provider publishes one) or by ID, test them, and set the default. Pick a different model for a single bot from the composer. Users supply model access; no subscription or key is bundled.

Cloud keys entered in Electron are encrypted using OS-backed `safeStorage`. The renderer receives no stored key. Storage refuses unavailable encryption and Linux's insecure `basic_text` fallback.

## What works

- Electron supervises a separate local runtime. The React renderer has no Node integration.
- Socius is created on first launch. Create private bots manually or install specialist templates, and chat with each independently.
- The main bot can propose specialists through an AI SDK tool. Review the exact role/instructions before approval creates a fresh bot with no inherited memory or permissions.
- Streaming chat uses `ToolLoopAgent`, with bounded steps, cancellation and timeout. Chats and tasks persist in SQLite.
- Attach `.txt` or `.md` documents up to 200 KB. Installed instruction skills influence procedure. Responses can be saved as Markdown.
- Install previews show source, trust, digest, dependencies and requested permissions. Newly requested permissions need consent; installation verifies the plan digest and file integrity, then persists receipts atomically. Packages can be enabled, disabled, updated, rolled back and uninstalled.
- Import standard [Agent Skills](https://agentskills.io/specification) folders (`SKILL.md`) as instruction-only, locally unverified releases; export skills and bot templates after reviewing flagged text. Bots load skill instructions and reference files on demand.
- **Notion connector** over Notion's official MCP server: sign in through the system browser (OAuth with PKCE), with tokens encrypted by the OS. Grant each bot read and/or write access. Bots search and read pages; creating a page needs your approval of the exact title and content, survives restart, and runs once. Unclear outcomes are checked, never blindly repeated. See [skills and connectors](docs/architecture/skills-and-connectors.md) for setup and scopes.
- Browse the official MCP Registry from Connect Apps. Listings are metadata only; only Socius-reviewed servers are installable.
- Memory is private per bot: editable Markdown files plus SQLite FTS5 search. External file edits reconcile when memory is read.
- Enable memory per bot explicitly; model-proposed saves require review and recheck permissions.
- **Dreaming** (opt-in, Settings → Dreaming): while Socius is idle, a separately chosen model consolidates completed direct-chat user messages into each bot's private memory, citing its sources. Later chats recall relevant notes. Correct or delete notes in Memory; deleting one also stops its sources being reused. No tools or external actions. See [Dreaming](docs/architecture/dreaming.md).
- Messaging-style interface: bot sidebar with the main bot featured, a `To:` new-chat palette (⌘N/⌘K, ⌘1–9 to pick), chat bubbles with safe Markdown rendering, and a Connect Apps modal. Appearance (System/Light/Dark) is in Settings and the account menu; the choice is stored locally.
- Group chats: pick bots and Socius coordinates a conversation. It knows each member's role and instructions, asks members for help with an `askMember` tool, and replies last. Members answer under their own name with their own permissions. See [Group chats](docs/architecture/group-chats.md).
- Approvals (proposed bots and memory saves) are reviewed inline in the proposing bot's chat or group chat; a blue dot marks it in the sidebar.
- Activity keeps a local record of chats, reviews, memory changes, and installs. Provider keys and exception bodies are omitted. The Activity page and Settings show that record. Analytics and remote crash reporting are off.

- **Routines (runtime and API only, pending review).** Private, disabled-by-default routines for one bot: tasks, morning briefs, watchers over a reviewed connector read, and finite goal follow-ups, on one-time, interval, daily or weekly schedules in an IANA time zone. Missed runs are skipped and recorded by default; runs are checkpointed, fenced to one runtime, resume after a restart without replaying effects, and every write is still an exact-action approval. Unchanged watchers stay quiet. Results go to an in-app inbox through `/api/routines`; there is no routine screen yet. See [Routines](docs/architecture/routines.md).

Pending approvals survive restart and cannot be approved twice. An interrupted chat task is marked failed and requires explicit retry; chat model calls are not checkpoint-resumed (routine runs are, from completed steps). Delegation happens in group chats; direct chats do not delegate.

## Browser mode and packaging

```sh
npm run web        # build; start localhost:3030; print a one-time pairing link
npm run package    # build an unsigned application directory for this platform
```

Browser mode does not persist keys entered through a browser; it uses each provider's standard environment variable (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENROUTER_API_KEY`, `AWS_*`, …), which Settings reports by name only. Desktop mode also accepts these environment variables. Never store credentials in URLs or repository files.

Desktop data is under Electron's per-user app-data directory in `workspace/`. Browser mode uses `.socius/`. `SOCIUS_DATA_DIR` and `SOCIUS_PORT` configure browser mode; `SOCIUS_USER_DATA` selects a separate desktop profile. Shut down Socius before backing up the whole workspace, including SQLite/WAL files.

The API binds loopback and uses one-time pairing, an HttpOnly same-site cookie, host/origin checks and bounded requests. Phone pairing/Tailscale exposure is a remaining integration. Packaging uses electron-builder; public signing, notarization and updater hosting are release work.

## Remaining workstreams

Public publishing and signed releases, arbitrary executable skills, connectors beyond Notion, browser automation, a routine UI, closed-app or cloud scheduling, PDF/Office parsing, phone access and auto-updates are not implemented. There are no fake production model responses.

Skill scripts are stored inert; there is no executable sandbox. Digest checks bind review to content, not publisher identity: imported releases are labelled unverified. Connecting accounts requires the desktop app's OS-backed encryption. The interface currently uses shared CSS tokens and native dialogs; Tailwind/shadcn adoption can occur inside the UI workstream without altering runtime contracts.

## Verify

```sh
npm run check
npm run catalog:check
npm run build
npm run test:e2e
```

Browser end-to-end tests use a deterministic model fixture only in test code and a temporary workspace. A separate test exercises the real AI SDK provider/stream/tool pipeline against a controlled HTTP endpoint. Desktop tests verify launch and restart persistence. Live cloud/local inference requires provider access and is a separate check. `npm run test:live` and `npm run test:live:dreaming` are opt-in. They send synthetic prompts to your default provider from an isolated temporary profile, which uses its quota.

## Where to start

- [Grok Bot research](docs/research/grok-bot.md): official product behavior, installed-app observations, uncertainties, and implications.
- [V1 architecture](docs/architecture/v1.md): boundaries and marketplace lifecycle.
- [Updated stack implementation sequence](docs/architecture/implementation-sequence.md): how the new Notion choices fit into verifiable delivery.
- [Group chats](docs/architecture/group-chats.md): coordinator model, limits and API.
- [Team handoff](docs/team-handoff.md): independent work packages and acceptance criteria.
- [Local API](docs/architecture/local-api.md): transport, endpoints and extension boundaries.
- [Skills and connectors](docs/architecture/skills-and-connectors.md): skill format, release lifecycle, MCP Registry, Notion setup and scopes, the action broker and known limitations.
- `packages/contracts`: strict manifest schemas and shared domain types.
- `packages/marketplace`: releases and trust, dependency planning, MCP Registry adapter, export review and the bundled Socius bot template.
- `packages/skills`: Agent Skills import/export. `packages/connectors`: reviewed connector actions over MCP.

The workspace packages are private TypeScript source packages. Public SDK distribution requires a compiled export surface, compatibility policy, and license decision.

Boards were retired on 2026-10-14 in favour of group chats. Existing board records remain in SQLite as historical data; no board API or background execution is active. Bots previously used on boards remain available in the Bots sidebar and can join group chats.
