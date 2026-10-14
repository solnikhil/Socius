# Core and live-provider acceptance — 14 October 2026

Tested against main at `b3e1ba8`, plus the Markdown rendering fix in this work unit. This run deliberately excluded Notion account testing and Ollama. No source-workspace chats, bots, permissions or memory were modified.

## Results

| Check | Evidence | Result |
| --- | --- | --- |
| Non-Notion automated suites, including renderer regressions | 97 tests; typecheck passes | Passed |
| Electron launch and restart | Isolated workspace; renderer has no Node globals | Passed |
| Browser core workflow | Model setup, bot creation/proposals, skills, memory and group chat with controlled fixtures | Passed |
| Live desktop streaming | OpenRouter `openrouter/free`; synthetic identifier displayed and task completed | Passed after rendering fix |
| Live document summary | Synthetic Juniper document; retained project name and 17-item count | Passed |
| Live bot proposal | Exact creation approval creates Acceptance Planner with no inherited grants | Passed on diagnostic run; first request omitted the tool call |
| Live memory | Pending proposal survives Electron restart; approval saves once; specialist sees no main-bot memory | Passed |
| Live group collaboration | Scoped specialist checks 17 + 25; specialist and Socius each return 42 in the attributed group thread | Passed |
| Cancellation, interruption/retry, budgets, revocation and reactions | Controlled runtime regression suites | Passed; these fault cases were not induced against the live provider |
| Notion account workflows | Not requested for this run | Deferred |

Live evidence was gathered across two runs after the renderer repair: the full run passed streaming and documents, then stopped because the bot request produced no proposal; a tools-only diagnostic confirmed text/tool connectivity and passed bot creation, memory/restart and group work. This is not a claim that the full live suite passed uninterrupted on its first attempt. Tool use on the configured free model/router was inconsistent on one observed request; the runtime's exact approvals and grant boundaries still held. A fixed tool-capable model should be included in release acceptance before treating this routing choice as reliably agentic.

## Defect found and fixed

The lightweight Markdown renderer incorrectly interpreted underscores within identifiers as emphasis. `SOCIUS_LIVE_OK` was saved correctly by the live runtime but displayed with altered spelling, causing the UI assertion to fail. Underscore emphasis now respects word boundaries, including Unicode combining marks. Renderer tests cover literal identifiers, legitimate emphasis, inline code and inert HTML. Reference: [CommonMark emphasis rules](https://spec.commonmark.org/0.31.2/#emphasis-and-strong-emphasis).

## Repeat the live check

Run `npm run test:live` explicitly. It builds the app and runs `scripts/live-provider-check.ts --live`; ordinary `npm test` does not make live model calls.

The script copies only the selected provider connection's encrypted credential payload/configuration and model selection into an isolated temporary desktop profile. It never prints/decrypts a key in the test driver, copies no user conversations or memory, and has no connected Notion account. Electron's existing runtime decrypts credentials using OS storage. Synthetic test prompts are sent to the configured model, so this command uses that provider's quota/billing. The temporary profile is removed afterward. A redacted summary is written to `test-results/live-provider.json` (ignored by Git).

For a tools-only diagnostic, run `SOCIUS_LIVE_TEST=1 node --import tsx scripts/live-provider-check.ts --tools-only`. Override `SOCIUS_LIVE_SOURCE_PROFILE` or `SOCIUS_ELECTRON_EXECUTABLE` when needed. The default source profile and executable were verified on macOS; other platforms need explicit paths and remain unverified by this run.
