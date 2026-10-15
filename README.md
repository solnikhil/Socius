# Socius

Socius is a desktop AI ally. It gives you a persistent main bot, a team of private specialist bots, memory you can open and edit, and your approval on every action that changes something outside the app. Bring your own model from any of 29 providers, local or cloud. Everything runs on your computer. There is no account, no analytics and no remote crash reporting.

> **Status: early preview.** There are no signed installers or auto-updates yet; build from source (below). This README separates what ships today from what is in preview or planned.

**Contents:** [Quick start](#quick-start) · [What you can do](#what-you-can-do) · [Model providers](#model-providers) · [Connect Apps](#connect-apps-skills-connectors-and-templates) · [Browser mode and packaging](#browser-mode-and-packaging) · [Configuration](#configuration) · [Data and backups](#data-and-backups) · [Security model](#security-model) · [Project layout](#project-layout) · [Scripts](#scripts) · [Verify](#verify) · [Product site](#product-site) · [Not implemented yet](#not-implemented-yet) · [Documentation](#documentation)

## Quick start

You need Node.js 24 and npm. The first Electron launch downloads the official runtime.

```sh
npm ci
npm run desktop
```

1. Open **Settings** (account menu or ⌘,). It floats over the workspace.
2. Under **Providers**, connect a model provider. For a fully local setup, choose Ollama, LM Studio or llama.cpp.
3. Under **Models**, add a model from the provider's live list (where it publishes one) or by ID, test it, and set it as the default.
4. Chat with **Socius**, which is created on first launch.

Socius doesn't bundle a subscription or a key; you supply your own model access.

## What you can do

### Socius, your main bot

- Socius answers like a general assistant. Every model call starts with the environment it actually has: the current date, time and zone, the model in use, whether you're on desktop or phone, and the real tools available for that call. It answers time questions directly and doesn't claim tools it lacks.
- **Asking specialists (automatic).** In its direct chat, Socius can ask a named specialist for help (`askBot`). The specialist answers with its own model, memory, skills and apps, sees only Socius's request (not the chat history), and its reply appears in Socius's chat with its name. Limit: 6 asks per message. If the specialist has connected apps, the ask itself waits for your approval first.
- **Changing your workspace (approved each time).** Socius can propose to create a bot, update a bot's name, role or instructions, create a group chat, or change a group's members. Each proposal shows a review card with the exact change and waits for you. See [orchestration](docs/architecture/orchestration.md).
- Streaming chat runs on the AI SDK `ToolLoopAgent`, with bounded steps, cancellation and a timeout. Chats and tasks persist in SQLite.

### Specialist bots

- Create bots by hand, install a template from Connect Apps, or approve one that Socius proposes. You review the exact role and instructions before approving. A new bot starts with no inherited memory and no permissions.
- Each bot has its own **look**: pick one of five shapes and five eye styles. Faces breathe, blink and follow your pointer. While a bot is working, its eyes circle smoothly. Socius keeps its own monochrome scalloped face.
- Each bot can use a different model. You can also switch the model for one message from the composer.
- Grants are per bot: memory, skills, connectors and browsing are each enabled explicitly.

### Group chats

Pick some bots and Socius coordinates the conversation. It knows each member's role and instructions, asks members for help through an `askMember` tool, and replies last. Members answer under their own name with their own permissions. Group chats are the only collaboration surface; see [Group chats](docs/architecture/group-chats.md).

### Approvals

Anything that writes to the outside world waits for your review of the exact action, inline in the chat that proposed it. That covers new bots, memory saves, connector writes, and browser clicks, typing and submissions. A blue dot marks the chat in the sidebar. Pending approvals survive a restart and can't be approved twice. An approved action runs once. If the outcome is unclear, Socius checks it rather than repeating it.

### Memory and Dreaming

- **Memory** is private to each bot and turned on per bot. It is stored as editable Markdown files plus a SQLite FTS5 search index. Edits you make in another editor are picked up the next time memory is read. A memory save proposed by a model waits for your review, and permissions are checked again when it runs.
- **Dreaming** is opt-in, under Settings → Dreaming. While Socius is idle, a model you choose separately turns finished direct-chat user messages into notes in each bot's private memory, citing its sources. Later chats recall relevant notes. If you delete a note, its sources aren't reused. Dreaming has no tools and takes no external actions. See [Dreaming](docs/architecture/dreaming.md).

### Browser control (preview)

Give a bot browsing access and it researches public pages in its own Chromium window. A live preview sits beside the chat, and the window itself starts minimized. You can **Take control** to sign in or navigate, then **Resume** to hand it back. Clicks, typing and submissions wait for your review of the exact page, element and text. Local and private-network addresses are blocked, and each bot has its own browser profile, separate from yours. Run `npx playwright install chromium` first, or set `SOCIUS_BROWSER_PATH`. Packaged builds include the browser driver. See [browser control](docs/architecture/browser-control.md); the visible desktop acceptance run is not yet recorded.

### Phone access over Tailscale (preview)

Run Socius on your laptop, share it on your private tailnet with `tailscale serve`, and pair a phone using a QR code or a six-digit code. The phone controls the same running workspace. Each device has its own revocable session. Host-only actions, such as provider keys, app sign-in and package installs, stay on the laptop. Setup and the manual checklist are in [remote access](docs/architecture/remote-access.md). Testing on a real tailnet and device is still pending.

### Routines (runtime and API only)

Routines belong to one private bot and are off by default: tasks, morning briefs, watchers over a reviewed connector read, and finite goal follow-ups. They run one-time, at an interval, daily or weekly, in an IANA time zone. By default, missed runs are skipped and recorded. Runs are checkpointed and resume after a restart without repeating effects. Every write is still an exact-action approval. Results go to an in-app inbox through `/api/routines`. **There is no routine screen yet.** See [Routines](docs/architecture/routines.md).

### Everyday interface

- Messaging-style layout: a bot sidebar with Socius featured, a `To:` new-chat palette (⌘N or ⌘K, then ⌘1–9 to pick), and chat bubbles with safe Markdown rendering.
- Attach `.txt` or `.md` documents up to 200 KB. Save any reply as Markdown, and react to replies; reactions are saved.
- Appearance (System, Light or Dark) is in Settings and the account menu, and the choice is stored locally.
- **Activity** keeps a local record of chats, reviews, memory changes and installs. Provider keys and exception bodies are left out.

## Model providers

29 [AI SDK](https://ai-sdk.dev) providers, with several accounts per provider allowed:

| Kind | Providers |
| --- | --- |
| Local / self-hosted | Ollama, LM Studio, llama.cpp, any OpenAI-compatible server |
| Cloud | OpenAI, Anthropic, Google Gemini, Mistral, xAI, Groq, DeepSeek, Cerebras, Fireworks, Together AI, Perplexity, Cohere, DeepInfra, Baseten, Hugging Face, Moonshot AI, Alibaba Qwen, MiniMax, Z.ai |
| Enterprise clouds | Azure OpenAI, Amazon Bedrock, Google Vertex AI, Claude on Vertex |
| Gateways | Vercel AI Gateway, OpenRouter |

In the desktop app, cloud keys are encrypted with Electron's OS-backed `safeStorage`. The renderer never receives a stored key. Storage is refused when encryption is unavailable, and on Linux's insecure `basic_text` fallback. Both desktop and browser mode also read each provider's standard environment variable (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENROUTER_API_KEY`, `AWS_*`, …), which Settings reports by name only. Settings also shows where each provider sends chat context: this computer, a configured endpoint, or the cloud.

## Connect Apps: skills, connectors and templates

One catalog for everything a bot can be given. An install preview shows the source, trust level, digest, dependencies and requested permissions. Package code is never executed during parsing, preview or dependency resolution. Newly requested permissions need your consent. Installation verifies the plan digest and file integrity, then saves receipts atomically. Packages can be enabled, disabled, updated, rolled back and uninstalled.

- **Skills.** Import standard [Agent Skills](https://agentskills.io/specification) folders (`SKILL.md`) as instruction-only releases, labelled locally unverified. You can export skills and bot templates after reviewing flagged text. Assign skills per bot to load on demand or always. Bots load skill instructions and reference files when needed. Skill scripts are stored but never run.
- **Bot templates.** Install specialists from the catalog; the Socius template is bundled.
- **MCP Registry.** Browse the official registry from Connect Apps. Listings are metadata only; you can install only servers Socius has reviewed.
- **Connectors.** Each one goes through install, then a per-bot read or write grant, then sign-in through the system browser (OAuth with PKCE). Tokens are encrypted by the OS. Reads run directly; every write needs your approval of the exact content.

| Connector | Status | Reads | Approved writes | Setup |
| --- | --- | --- | --- | --- |
| Notion | **Reviewed and connectable** | Search and read pages | Create a page | [Skills and connectors](docs/architecture/skills-and-connectors.md) |
| Linear | Draft, no live-account acceptance | Search and read issues | Create an issue | [linear.md](docs/connectors/linear.md) |
| GitHub | Draft, no live-account acceptance | Search and read issues | Create an issue | [github.md](docs/connectors/github.md) |
| Gmail | Draft, no live-account acceptance | Search and read threads | Create a draft (never sends) | [gmail.md](docs/connectors/gmail.md) |
| Google Calendar | Draft, no live-account acceptance | List events | Create an event (no attendees) | [google-calendar.md](docs/connectors/google-calendar.md) |
| Slack | Draft, no live-account acceptance | Search public channels | Post a top-level message | [slack.md](docs/connectors/slack.md) |
| Google Drive | Draft, no live-account acceptance | Search and read files | Create a document | [google-drive.md](docs/connectors/google-drive.md) |

The draft connectors need your own OAuth app registration, configured on the runtime host (`SOCIUS_<SERVICE>_CLIENT_ID` / `_CLIENT_SECRET`). The Google services also need the Workspace MCP Developer Preview.

## Browser mode and packaging

```sh
npm run web        # build; start localhost:3030; print a one-time pairing link
npm run package    # build an unsigned application directory for this platform
```

Browser mode doesn't persist keys entered in the browser; it uses provider environment variables instead. Connecting accounts requires the desktop app's OS-backed encryption. Don't use `npm run web` for phone access: it may use a different data directory and lacks the desktop credential bridge. Packaging uses electron-builder. Public signing, notarization and update hosting are still release work.

## Configuration

| Variable | Applies to | Purpose |
| --- | --- | --- |
| `SOCIUS_USER_DATA` | Desktop | Use a separate desktop profile |
| `SOCIUS_RUNTIME_PORT` | Desktop | Preferred initial runtime port (default 47613; collisions try the next 20) |
| `SOCIUS_DATA_DIR` | Browser mode | Workspace directory (default `.socius/`) |
| `SOCIUS_PORT` | Browser mode | HTTP port (default 3030) |
| `SOCIUS_BROWSER_PATH` | Both | Chromium/Chrome binary for browser control |
| `SOCIUS_<SERVICE>_CLIENT_ID` / `_CLIENT_SECRET` | Runtime host | OAuth apps for the draft connectors (`GITHUB`, `GMAIL`, `CALENDAR`, `SLACK`, `DRIVE`) |
| Provider variables (`OPENAI_API_KEY`, …) | Both | Model access without storing keys |

Never put credentials in URLs or repository files.

## Data and backups

Desktop data is in Electron's per-user app-data directory, under `workspace/`. Browser mode uses `.socius/`. The workspace holds SQLite (chats, tasks, approvals, activity, routines), each bot's Markdown memory, and per-bot browser profiles. Shut Socius down before backing up the whole workspace, including the SQLite/WAL files.

Boards were retired on 2026-10-14 in favour of group chats. Existing board records remain in SQLite as historical data; no board API or background execution is active. Bots used on boards remain in the sidebar and can join group chats.

## Security model

- Electron supervises a separate local runtime. The React renderer has no Node integration.
- The API binds to loopback only. It uses one-time pairing, an HttpOnly same-site cookie, host and origin checks, and bounded requests.
- Manifest capabilities are requests. The runtime enforces every grant on every call path, and never relies on prompts.
- Published templates stay separate from private bot instances, user memory and credentials.
- Remote content (web pages, connector results, attachments) is treated as untrusted data, never as instructions.
- Digest checks bind your review to the content, not to a publisher's identity, so imported releases are labelled unverified.

## Project layout

| Path | Contents |
| --- | --- |
| `apps/desktop` | Electron main process and the runtime worker |
| `apps/runtime` | Browser-mode entry point |
| `apps/web` | React interface (Tailwind and shadcn/ui primitives) |
| `apps/site` | Product website (see below) |
| `packages/contracts` | Strict manifest schemas and shared domain types (providers, appearance, routines, browser) |
| `packages/runtime` | Local server, store and migrations, model calls, action broker, dreaming, routines, browser service, remote access |
| `packages/marketplace` | Releases and trust, dependency planning, MCP Registry adapter, export review, bundled Socius template |
| `packages/skills` | Agent Skills import and export |
| `packages/connectors` | Reviewed connector actions over MCP |

The workspace packages are private TypeScript source packages. A public SDK would need a compiled export surface, a compatibility policy and a license decision.

## Scripts

| Command | Does |
| --- | --- |
| `npm run desktop` / `npm run dev` | Build and launch the Electron app |
| `npm run web` | Build and serve browser mode on localhost |
| `npm run package` | Build an unsigned app directory |
| `npm run build` | Build the interface and desktop bundles into `dist/` |
| `npm run site` / `npm run site:build` | Product site dev server / static build into `dist/site` |
| `npm run check` | Typecheck and unit tests |
| `npm run catalog:check` | Validate the marketplace catalog |
| `npm run test:e2e` | Playwright browser and desktop tests |
| `npm run format` / `npm run format:check` | Prettier |
| `npm run test:live` / `npm run test:live:dreaming` | Opt-in live checks against your default provider |

## Verify

```sh
npm run check
npm run catalog:check
npm run build
npm run test:e2e
```

The browser end-to-end tests use a deterministic model fixture, which exists only in test code, and a temporary workspace. A separate test runs the real AI SDK provider, stream and tool pipeline against a controlled HTTP endpoint. Desktop tests check launch and persistence across a restart. Live inference needs provider access and is a separate check. `npm run test:live` and `npm run test:live:dreaming` send synthetic prompts to your default provider from an isolated temporary profile, using your quota. Dated evidence is in [docs/validation](docs/validation).

## Product site

```sh
npm run site         # dev server for the marketing site in apps/site
npm run site:build   # static build into dist/site
```

A static, Notion-styled product page with animated sections and a live product demo. It reuses the app's own avatar faces, provider marks and shadcn primitives through the `@` alias, so the mascot and logos stay in sync with the app. It describes only shipped behavior, and it labels previews as previews. It has no analytics. Fonts load from Google Fonts.

Live at **https://socius-site.vercel.app** (Vercel project `socius-site`). To redeploy, run `npm run site:build`, then run `npx vercel deploy --prod` from a copy of `dist/site` in a folder named `socius-site`. The folder name selects the Vercel project.

## Not implemented yet

- Signed installers, notarization and auto-updates.
- A routine screen, and scheduling while the app is closed or in the cloud.
- Live-account acceptance for the draft connectors, plus any connectors beyond them. API-key MCP servers (for example Razorpay and Cashfree) aren't connectable.
- An executable sandbox for skills; skill scripts stay inert.
- PDF, Office and image attachments.
- Real-device acceptance for phone access, and complete remote service lifecycle management.
- Public package publishing and publisher signatures.

There are no fake production model responses. The [roadmap](docs/roadmap.md) and [feature specification](docs/specs/product-expansion.md) list planned work, which is not yet shipped.

## Documentation

- [V1 architecture](docs/architecture/v1.md): boundaries and the marketplace lifecycle.
- [Local API](docs/architecture/local-api.md): transport, endpoints and extension boundaries.
- [Orchestration](docs/architecture/orchestration.md): asking specialists and approved workspace changes.
- [Group chats](docs/architecture/group-chats.md): the coordinator model, limits and API.
- [Skills and connectors](docs/architecture/skills-and-connectors.md): skill format, release lifecycle, MCP Registry, Notion setup, the action broker. Per-connector setup is in [docs/connectors](docs/connectors).
- [Dreaming](docs/architecture/dreaming.md) and its [specification](docs/specs/dreaming.md).
- [Routines](docs/architecture/routines.md): scheduling, durable execution and quiet proactivity.
- [Browser control](docs/architecture/browser-control.md) and [remote access](docs/architecture/remote-access.md).
- [Implementation sequence](docs/architecture/implementation-sequence.md), [team handoff](docs/team-handoff.md) and [UI refinement](docs/ui-refinement.md).
- [Grok Bot research](docs/research/grok-bot.md): product research that informed the design.
- [Teams and boards](docs/architecture/teams.md): historical only; boards are retired.
