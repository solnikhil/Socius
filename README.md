# Socius

A desktop AI ally with a persistent main bot, private specialist bots, editable local memory, and a **Connect Apps** catalog of skills, connectors and bot templates. Light and dark themes follow the system or a saved preference.

## Start the desktop app

Use Node.js 24 and npm. The first Electron launch downloads the official runtime.

```sh
npm ci
npm run desktop
```

In Settings, choose a provider and enter a model ID available on it. For local inference, start Ollama and download your chosen tool-capable model first. The default endpoint is `http://127.0.0.1:11434/v1`. LM Studio and llama.cpp use the OpenAI-compatible option. OpenAI and Anthropic have direct adapters. Users supply model access; no subscription or key is bundled.

Cloud keys entered in Electron are encrypted using OS-backed `safeStorage`. The renderer receives no stored key. Storage refuses unavailable encryption and Linux's insecure `basic_text` fallback.

## What works

- Electron supervises a separate local runtime. The React renderer has no Node integration.
- Socius is created on first launch. Create private bots manually or install specialist templates, and chat with each independently.
- The main bot can propose specialists through an AI SDK tool. Review the exact role/instructions before approval creates a fresh bot with no inherited memory or permissions.
- Streaming chat uses `ToolLoopAgent`, with bounded steps, cancellation and timeout. Chats and tasks persist in SQLite.
- Attach `.txt` or `.md` documents up to 200 KB. Installed instruction skills influence procedure. Responses can be saved as Markdown.
- Curated install previews show dependencies/capabilities. Installation verifies the reviewed digest and persists receipts atomically. Connector entries clearly state that execution is unavailable.
- Memory is private per bot: editable Markdown files plus SQLite FTS5 search. External file edits reconcile when memory is read.
- Enable memory per bot explicitly; model-proposed saves require review and recheck permissions.
- Messaging-style interface: bot sidebar with the main bot featured, a `To:` new-chat palette (⌘N/⌘K, ⌘1–9 to pick), chat bubbles with safe Markdown rendering, and a Connect Apps modal. Appearance (System/Light/Dark) is in Settings and the account menu; the choice is stored locally.
- Group chats: pick two or more bots and Socius coordinates. It knows each member's role and instructions, asks members for help with an `askMember` tool, and replies last. Members answer under their own name with their own permissions. See [Group chats](docs/architecture/group-chats.md).
- Approvals (proposed bots and memory saves) are reviewed inline in the proposing bot's chat; a blue dot marks that bot in the sidebar. There is no separate review screen.
- Activity keeps a local record of chats, reviews, memory changes, and installs. Provider keys and exception bodies are omitted. The Activity page and Settings show that record. Analytics and remote crash reporting are off.

Pending approvals survive restart and cannot be approved twice. An interrupted running task is marked failed and requires explicit retry; model execution is not checkpoint-resumed. Socius delegates only inside group chats; direct chats with specialists stay independent.

## Browser mode and packaging

```sh
npm run web        # build; start localhost:3030; print a one-time pairing link
npm run package    # build an unsigned application directory for this platform
```

Browser mode uses `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` environment variables and does not persist keys entered through a browser. Desktop mode also accepts these environment variables. Never store credentials in URLs or repository files.

Desktop data is under Electron's per-user app-data directory in `workspace/`. Browser mode uses `.socius/`. `SOCIUS_DATA_DIR` and `SOCIUS_PORT` configure browser mode; `SOCIUS_USER_DATA` selects a separate desktop profile. Shut down Socius before backing up the whole workspace, including SQLite/WAL files.

The API binds loopback and uses one-time pairing, an HttpOnly same-site cookie, host/origin checks and bounded requests. Phone pairing/Tailscale exposure is a remaining integration. Packaging uses electron-builder; public signing, notarization and updater hosting are release work.

## Remaining workstreams

Public publishing and signed releases, arbitrary executable skills, MCP/OAuth connector execution, browser automation, scheduling, delegation outside group chats, PDF/Office parsing, phone access and auto-updates are not implemented. There are no fake production model responses.

Current skills are curated instruction manifests; standard Agent Skills directory import/export is a next deliverable. Digest checks bind review to bundled content, not publisher identity. The interface currently uses shared CSS tokens and native dialogs; Tailwind/shadcn adoption can occur inside the UI workstream without altering runtime contracts.

## Verify

```sh
npm run check
npm run catalog:check
npm run build
npm run test:e2e
```

Browser end-to-end tests use a deterministic model fixture only in test code and a temporary workspace. A separate test exercises the real AI SDK provider/stream/tool pipeline against a controlled HTTP endpoint. Desktop tests verify launch and restart persistence. Live cloud/local inference requires provider access and is a separate check.

## Where to start

- [Grok Bot research](docs/research/grok-bot.md): official product behavior, installed-app observations, uncertainties, and implications.
- [V1 architecture](docs/architecture/v1.md): boundaries and marketplace lifecycle.
- [Updated stack implementation sequence](docs/architecture/implementation-sequence.md): how the new Notion choices fit into verifiable delivery.
- [Group chats](docs/architecture/group-chats.md): coordinator model, limits and API.
- [Team handoff](docs/team-handoff.md): independent work packages and acceptance criteria.
- [Local API](docs/architecture/local-api.md): transport, endpoints and extension boundaries.
- `packages/contracts`: strict manifest schemas and shared domain types.
- `packages/marketplace`: validated catalog, dependency planning, and bundled Socius bot template.

The workspace packages are private TypeScript source packages. Public SDK distribution requires a compiled export surface, compatibility policy, and license decision.
