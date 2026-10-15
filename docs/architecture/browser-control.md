# Browser control

Issue [#26](https://github.com/solnikhil/Socius/issues/26). Status on 15 October 2026: runtime foundation, takeover/resume, exact-action approval, network boundary, API, a minimal browser panel and deterministic real-Chromium tests are implemented on `codex/browser-control`. The visible desktop acceptance run with a human takeover and a consented live-model run are **not yet recorded** (see [Not yet verified](#not-yet-verified)). The UI owner has not reviewed the panel's visual design.

## What it does

A bot the user has granted browser access gets its own dedicated Chromium window. It starts minimized, with a periodically refreshed page preview in a right-hand column beside the chat. The column reserves layout space rather than covering messages or the composer; narrow screens stack a bounded panel above the conversation. The preview can be collapsed. **Open browser** restores the window; **Minimize window** puts it away without stopping work. Native minimization is best effort when the window manager does not support it.

In a direct or group chat the bot can open public pages, follow links, use site search boxes, scroll, read page text and manage tabs. Its answer cites the pages it read. The user can press **Take control** at any time, restoring the window to drive it (sign in, solve a CAPTCHA, navigate), then press **Resume** to hand it back and minimize it. The bot re-observes the page and continues the original request. Clicking buttons, typing into fields and submitting forms always wait for the user's review of the exact page, element and text; the user can approve, decline or choose **I'll do it myself**.

## Decision

Playwright (`playwright-core` 1.64.0, Apache-2.0) launches Chromium with a persistent context per bot, wrapped by `BrowserService` (`packages/runtime/src/browser/service.ts`) and exposed to the existing AI SDK tool loop. No general MCP server, Stagehand, Browser Use or hosted browser is used. Element references come from Playwright's AI-mode aria snapshot (`page.ariaSnapshot({ mode: "ai" })` and `page.getByRef`), the same pattern Playwright MCP uses, behind Socius's own gate. No raw JavaScript, CDP endpoint, file path or shell is exposed to a model or renderer.

## Session and profile

- One session per bot (`browser-session` records). Metadata only: owner bot, bound task and group, control mode and revision, the device holding human control, the task objective, tabs (URL/title), last confirmed URL and action, up to 40 visited pages and a status note. Cookies, sign-ins and history stay in the bot's profile directory `<data>/browser/profiles/<botId>` (mode 0700) and never appear in snapshots, templates, exports or model context.
- The profile is separate from the user's own Chrome profile. One process owns a profile: the runtime keeps one context per session, and Chromium's own profile lock makes a second process fail with "already open"; a stale lock from a crash is cleared by Chromium. **Clear browser data** (`/api/browser/reset`) closes the window and deletes the profile.
- Tools always resolve the calling bot's own session. Group membership does not give a bot another bot's session.
- Deleting a bot closes its browser and removes its profile and records.

## Control state machine

`ready → agent → awaiting-approval → agent → ready`, with `handoff-pending → human`, `stopped` and `failed`. Exactly one owner holds input. Every ownership change increments the session's `revision`.

- **Binding.** The first browser tool call of a foreground task binds the session to that task at a new revision. Another task gets "busy"; a human-controlled session is refused.
- **Gate.** Every command checks, before queueing and again immediately before dispatch: the task is still running, the bot still holds `browser.control`, the session is bound to this task at the bound revision and the mode is `agent`/`awaiting-approval`. Commands run one at a time. A result that finishes after the revision changed is discarded.
- **Take control.** Increments the revision first (nothing queued can start), withdraws pending proposals, cancels the bound task and its model inference, waits for the command already running to finish (up to 15 s), then reports `human`. Something already sent to a site cannot be undone; the panel says so.
- **Human mode.** The agent can neither act nor observe. The user uses the real window. If the user presses Take control on one device, another local device cannot also claim it or resume it.
- **Interference.** Trusted mouse/keyboard input in the window while the agent is driving (outside its own commands) is treated as the user taking over: the agent stops and the user gets control, rather than competing for the page.
- **Resume.** Only from `human`, from the device that took control, and only while the bot still holds the grant. It increments the revision; earlier element references and proposals stay void. The panel then posts "I've handed the browser back. Please continue." in the chat; the runtime tells the bot the original objective and that it must call `browserTabs`/`browserObserve` first and not repeat a step blindly.
- **Stop.** Cancels the task, withdraws proposals and closes the window. Nothing in progress is repeated.
- **Window closed or crashed.** The bound task is cancelled, pending proposals are withdrawn, an executing interaction becomes `unknown`, and the session is `stopped`.
- **Restart.** No browser survives a restart. Active sessions become `stopped`, pending proposals `invalidated` and executing interactions `unknown`. Nothing is replayed.
- **Revocation.** Revoking the grant withdraws proposals, cancels a bound task and removes the tools from later calls.

## Agent tools

`browserOpen`, `browserObserve`, `browserFollowLink`, `browserSearch`, `browserScroll`, `browserReadText`, `browserTabs`, `browserSwitchTab`, `browserCloseTab`, `browserProposeInteraction`. They are added only in foreground tasks of a bot with the grant; routines never get them.

- References look like `o3.e12`: observation 3, element `e12`. Only the latest observation of the active tab is valid; navigation, scrolling, tab switches, takeover and resume invalidate references.
- `browserFollowLink` navigates to the link's `href` through the same URL check; it does not click.
- `browserSearch` builds the results URL from an ordinary GET search form the way the form would submit it. POST forms and other controls need `browserProposeInteraction`.
- **Exfiltration guard.** Once a task has read page content (`browserObserve` or `browserReadText`), an injected instruction could make the agent put private context into an address. From then on an address the agent builds itself is opened only after the user reviews it (a `navigate` proposal showing the exact address), unless the user wrote it, a page the agent read linked to it, or it goes to a trusted site — one the user named or the agent opened before reading anything — as a search, or as a page without a query string. Following links needs no review.
- Bounds per task: 40 commands, 80,000 characters of page text, 12,000 characters per observation, 8,000 per read, 6 tabs, and a refusal after three identical consecutive steps. Model steps rise from 6 to 24 when browser tools are present; direct chats with browsing time out after 10 minutes instead of 3, groups after 10 instead of 5. Time waiting for a review never counts.
- Results carry URL, title and retrieval time. Pages that could not be opened return an error; the bot is told to say so.

## Interactions and approval

`browserProposeInteraction` supports `click`, `fill` and `fill-and-submit`. The proposal records the session, control revision, observation number, origin, URL, element reference, a fingerprint of the element as the page describes it (tag, type, name, label, form method and action) and the exact text. Its digest covers all of these. Password, one-time-code, payment and file fields are refused outright: the bot is told to ask the user to take control.

Approval (`/api/browser/actions/resolve`, local only) checks the digest, then — in the command queue, immediately before dispatch — rechecks the grant, the revision, the bound task, the mode, the page URL, the observation number and the element fingerprint. Any difference withdraws the proposal. Intent is persisted as `executing` before the click/fill. A `fill-and-submit` that the page does not answer with a successful navigation within 10 s is recorded as `unknown`; nothing is retried automatically. **I'll do it myself** hands the browser to the user and the proposal never runs. Takeover, stop, revoke, resume, window close and restart all invalidate pending proposals.

A site's own JavaScript can still react to a click in ways the fingerprint does not describe. When a generic site offers no defensible target, the user should choose **I'll do it myself**. An LLM's statement that a click is safe is never used.

## Network boundary

- Chromium's proxy is a local filtering proxy (`packages/runtime/src/browser/network.ts`) on loopback. Loopback is forced through it (`<-loopback>`). For every request — navigations, redirects, subresources, `fetch`, WebSocket tunnels — the proxy resolves the host itself, refuses the request if any resolved address is loopback, private (RFC 1918), CGNAT/Tailscale (100.64/10), link-local, multicast, reserved, IPv6 ULA/link-local or an IPv4-mapped private address, and connects to the checked address. DNS rebinding therefore cannot reach the runtime, the LAN or the tailnet. `.local`, `.localhost`, `.internal`, `.ts.net` and single-label names are refused.
- Agent navigation additionally accepts only `http`/`https` URLs without embedded credentials.
- Downloads are refused, service workers blocked and WebRTC limited to proxied traffic (`disable_non_proxied_udp`; not separately tested). No upload or file chooser is driven by the agent.
- Tested: the runtime's own API and pairing URLs, `localhost`, `file:`, `169.254.169.254`, a redirect from an allowed page to a private port, and an image plus `fetch` to a private port from an allowed page are all refused; the private server receives no request.
- Not a sandbox: Chromium runs as the user, with the user's OS permissions. The proxy is a network policy, not process isolation. Tests allow a fixture by exact `host:port` (`RuntimeOptions.browser.allowHosts`); the product sets none.

## Model context and privacy

- Observations remove every form-field value (text, password, code, multi-line and rich-text editor content), and `browserReadText` leaves out inputs, text areas and editable regions, so typed passwords or drafts are never sent to a model. Pages that show a password, one-time-code or payment field carry a note telling the bot to ask the user to take control.
- Page text is labelled untrusted data; the instructions tell the bot never to follow instructions on pages. Models receive no screenshots, traces, cookies or network bodies.
- Page text the bot reads is sent to that bot's model provider. The grant dialog discloses this. Local browser execution is not a no-cloud claim.
- The local UI can request a JPEG of the current 1280×800 viewport. Captures share the command queue, mask inputs, textareas, selects, editable regions and embedded frames, and are discarded if the grant, control revision, page or active tab changes. Capture pauses during human control, handoff, stop and failure. The UI polls at most once every two seconds after each response, only while the preview is expanded and the app is visible; it clears frames on session/control/tab changes. Images are returned with `Cache-Control: no-store`, never written to disk, included in app snapshots, exported, or supplied to models. They remain page content visible to the local user, not a general secret detector. The endpoint is authenticated and local-only, so phones cannot fetch preview images.

## API

Local session only (`localOnly`); phones see status but cannot drive the browser. All are POST with JSON bodies.

| Endpoint                       | Body                     | Behaviour                                                             |
| ------------------------------ | ------------------------ | --------------------------------------------------------------------- |
| `/api/browser/grant`           | `{botId, granted}`       | Grant or revoke `browser.control`; revocation stops the agent at once |
| `/api/browser/take-control`    | `{sessionId}`            | Drains automation, then returns the session in `human` mode           |
| `/api/browser/resume`          | `{sessionId}`            | Hands control back (`ready`); the next task re-observes               |
| `/api/browser/stop`            | `{sessionId}`            | Cancels the task, withdraws proposals, closes the window              |
| `/api/browser/show`            | `{sessionId}`            | Starts the window if needed and brings it to the front                |
| `/api/browser/minimize`        | `{sessionId}`            | Minimizes the window while preserving the session; refused in human mode |
| `/api/browser/preview`         | `{sessionId}`            | Returns ephemeral `{image, note}` for the local UI; masked JPEG or a paused/unavailable explanation |
| `/api/browser/reset`           | `{botId}`                | Deletes the bot's browser profile and history                         |
| `/api/browser/actions/resolve` | `{id, digest, decision}` | `approve`, `deny` or `manual`                                         |

`GET /api/state` adds `browserSessions`, the last 50 `browserActions` and `browser: {available, detail}`. DTOs: `@socius/contracts/browser`.

## Setup and lifecycle

- `npm ci`, then `npx playwright install chromium` (or set `SOCIUS_BROWSER_PATH` to a Chromium/Chrome binary). Without a browser the grant dialog shows why and the tools return a clear error.
- The runtime worker launches Chromium; Electron asks the worker to shut down on quit, which closes bot browsers and the database before exit (5 s limit).
- `playwright-core` is loaded from `node_modules` at runtime, not bundled. **The electron-builder package does not include it yet**, so a packaged build reports browser support as unavailable. Development (`npm run desktop`) and browser mode work.

## Verification

- `e2e/browser-preview.spec.ts`: actual local Chromium window starts minimized, restores on Open/Take control and minimizes on Resume; preview, collapse/expand, reserved desktop layout and narrow-screen layout. Native window-state assertions run on the local host, not headless CI. The preview privacy fixture also decodes JPEG pixels to verify masks, checks authenticated/no-store responses and verifies capture pauses on takeover and fails after revocation. These fixtures do not establish live-model browsing or human sign-in acceptance.
- `packages/runtime/test/browser-policy.test.ts`: address classification, URL checks, proxy authentication/refusals and observation redaction, including rich-text editors and field names containing ": ".
- `packages/runtime/test/browser.test.ts` (real headless Chromium, scripted model, local fixture site; skipped when Chromium is not installed): grant gating; multipage research with links, new/switched tabs, GET search and cited visits; local/private/redirect/subresource refusal; field-value redaction and refused password fills; guessed and stale refs; exact approval running once and refusing a wrong digest or a repeat; takeover while a proposal waits (proposal withdrawn, task cancelled, no submission), agent refused in human mode, resume with fresh context and void old refs; takeover during a slow navigation waits for the drain and discards the result; one device at a time; per-bot sessions; mid-task revocation; real input pausing the agent; window close mid-proposal; restart; stop; reset; after reading pages, a self-built address with data or on an unnamed site waits for review (denied: no request reaches the site; approved: exactly one), while user-written addresses and page links stay free; editable text is left out of reads.
- A headed smoke run against `https://example.com` through the proxy opened, observed, refused `localhost` and took over in 9 ms.

## Not yet verified

- Desktop acceptance with a person: agent research → Take control and sign in → Resume on a changed tab → exact submission review or manual step → cited answer.
- A consented live-model run (fixtures only so far). Measured completion, takeover latency under a live model, token cost and failures are not recorded.
- Packaged (electron-builder) builds, Windows and Linux hosts, and a Chromium crash (as opposed to a close).
- Stagehand comparison: not started; no evidence it is needed.
- The exfiltration guard narrows, but cannot close, every channel: a trusted site that forwards path-based redirects, or a search sent to a trusted site that leaks its queries, could still carry data. Group coordinators' requests to members count as the user's words for this purpose.
- Notion and the roadmap remain unchecked until the acceptance runs above are recorded.
