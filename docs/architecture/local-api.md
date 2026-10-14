# Local API and extension boundaries

Electron supervises a Node utility process that binds `127.0.0.1` on an ephemeral port. Browser mode uses a configured port. A one-time local bootstrap URL creates an independent hashed device session and redirects to remove the token. The optional private phone milestone adds local-owner-enabled Tailscale HTTPS origin validation, separate Secure remote cookies and durable revocable sessions. All API requests require a session matching its local/remote origin kind; mutations require that exact Origin. Unexpected Host, inconsistent forwarded headers and cross-site requests are rejected; CORS access is not granted. See [remote access](remote-access.md) for setup, threat model and unverified real-device acceptance.

| Method | Endpoint                                         | Behavior                                                                                                                                                           |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/state`                                     | Bots, catalog releases, installations, connections, actions, tasks, approvals, activity, provider connections, models and selection; no stored credential or token |
| POST   | `/api/bots`                                      | Create private bot from name, role, instructions                                                                                                                   |
| POST   | `/api/bots/update`                               | Rename a bot: `{id,name}`                                                                                                                                          |
| POST   | `/api/bots/layout`                               | `{botId,pinned?,hidden?,unread?}`: sidebar pin, hide, or unread mark for that bot's direct chat                                                                    |
| DELETE | `/api/bots`                                      | Delete a specialist and its direct chat, memory and layout. Refuses the main bot and a bot with a running task. Group transcripts stay                             |
| GET    | `/api/messages?botId=`                           | Persistent bot conversation                                                                                                                                        |
| POST   | `/api/chat`                                      | Start bounded task and stream NDJSON                                                                                                                               |
| POST   | `/api/tasks/cancel`                              | Abort active task by ID                                                                                                                                            |
| POST   | `/api/install/preview`                           | Exact dependency plan with source, trust, installed versions, requested and newly requested capabilities, and plan digest                                          |
| POST   | `/api/install`                                   | `{id,version,digest,consent}`: verify digest, consent and file integrity, then atomically record receipts; instantiate bot roots                                   |
| POST   | `/api/installations/enable`                      | Enable or disable an installed package                                                                                                                             |
| POST   | `/api/installations/uninstall`                   | Remove a receipt unless another package depends on it; revoke connector connections                                                                                |
| POST   | `/api/installations/rollback`                    | Restore the previous release when it needs no new consent                                                                                                          |
| POST   | `/api/skills/import`                             | `{label,files:[{path,content(base64)}]}`: validate and stage an Agent Skills directory as a local-unverified release (8 MB limit)                                  |
| POST   | `/api/templates/import`                          | Import an exported bot template JSON as a local-unverified release                                                                                                 |
| POST   | `/api/export/skill/preview`, `/api/export/skill` | Review, then write a standard skill directory under `exports/`                                                                                                     |
| POST   | `/api/export/bot/preview`, `/api/export/bot`     | Review an allowlisted template draft; flagged text needs `acknowledge`                                                                                             |
| GET    | `/api/registry?search=&cursor=`                  | Cached, metadata-only MCP Registry page with Socius review status                                                                                                  |
| POST   | `/api/connectors/connect`                        | Start OAuth sign-in; returns the provider URL (desktop opens the system browser)                                                                                   |
| GET    | `/oauth/callback`                                | Provider redirect; authenticated by one-time state instead of the session cookie                                                                                   |
| POST   | `/api/connectors/verify`                         | Re-check credentials and upstream tool schemas                                                                                                                     |
| POST   | `/api/connectors/disconnect`                     | Revoke (best effort) and delete stored credentials                                                                                                                 |
| POST   | `/api/actions/resolve`                           | Approve or decline an exact external write by digest                                                                                                               |
| POST   | `/api/actions/check`                             | Re-check an unknown outcome without repeating the write                                                                                                            |
| POST   | `/api/actions/retry`                             | Retry only after Socius confirmed the write did not happen                                                                                                         |
| POST   | `/api/approvals`                                 | Apply/decline a pending proposal with exact digest and expiry                                                                                                      |
| GET    | `/api/memory?botId=&q=`                          | Reconcile/read/search scoped Markdown memory                                                                                                                       |
| POST   | `/api/memory`                                    | User editor creates/updates a record                                                                                                                               |
| DELETE | `/api/memory`                                    | User editor deletes record and derived index entry                                                                                                                 |
| POST   | `/api/grants`                                    | `{botId,memory}` or `{botId,capability:"documents.read"                                                                                                            | "documents.write",granted}` |
| POST   | `/api/providers`                                 | Create a provider connection: `{provider,label?,config,secrets}`; secrets OS-encrypted                                                                             |
| POST   | `/api/providers/update`                          | Edit label/config; `secrets` values replace, `null` removes, omitted keep. Endpoint change drops the old key                                                       |
| DELETE | `/api/providers`                                 | Remove a connection and its models/selections                                                                                                                      |
| POST   | `/api/providers/test`                            | Verify credentials: list models, or a short call to an added model; records status                                                                                 |
| GET    | `/api/providers/models?id=&refresh=1`            | Discover chat models from the provider's own catalog API (cached)                                                                                                  |
| POST   | `/api/models`                                    | Add a model `{connectionId,modelId,label?}`; first one becomes default                                                                                             |
| DELETE | `/api/models`                                    | Remove a model; selections using it are cleared                                                                                                                    |
| POST   | `/api/models/test`                               | Real text call plus tool-call check; records tool support                                                                                                          |
| POST   | `/api/models/select`                             | `{botId                                                                                                                                                            | null, model                 | null}`: set workspace default or a per-bot override |

Chat input: `{botId,content,attachment?:{name,text}}`. The bot's override, else the default model, is resolved before the task is recorded. Events: `started` with task ID, `text` with cumulative text, `done`, or `error` with a safe message and stable `code` (`unauthorized`, `model_not_found`, `unreachable`, `rate_limited`, `quota_exceeded`, `tools_unsupported`, `context_too_long`, …). Provider bodies are used for classification only and never returned, logged or persisted. If a model rejects tools before producing output, the task retries once without tools and the model is marked tool-less. Disconnecting does not cancel work; saved progress can be read again. One task per bot runs at a time, with six model steps and a three-minute timeout.

## Ownership

- `apps/desktop`: lifecycle, runtime supervision and OS encryption over a private parent/child channel. No renderer credential IPC.
- `apps/web/src/views`: independent chat, marketplace, memory and creation views; `views/settings` is the Settings dialog (General, Models, Providers, Privacy).
- `packages/contracts`: manifests and application DTOs.
- `packages/marketplace`: releases, trust, dependency planning, MCP Registry adapter, export review and private instantiation.
- `packages/skills`: Agent Skills `SKILL.md` import/export and safe directory reading.
- `packages/connectors`: reviewed connector actions and the MCP client.
- `packages/runtime/src/packages.ts`, `connections.ts`, `broker.ts`: package lifecycle, OAuth credentials and the shared action broker.
- `packages/contracts/src/providers.ts`: provider descriptors (fields, env fallbacks, discovery, destination) and connection/model DTOs.
- `packages/runtime/src/providers`: one AI SDK factory per provider, model discovery, model checks, error classification and the connection service.
- `packages/runtime/src/model.ts`: streaming tool loop and capability-gated tools.
- `packages/runtime/src/server.ts`: auth, validation, installation/approval orchestration and streaming.
- `packages/runtime/src/store.ts`, `migrations.ts`, `provider-store.ts`: versioned SQLite schema, records, provider tables, Markdown memory and derived FTS index. Migration 3 imports v1 single-provider settings.

## Extending actions

Register connector actions in reviewed runtime code (`packages/connectors`) and route every call through `ActionBroker.request`. Proposal creation is side-effect-free. Approvals bind actor (bot, task, optional board/run), release identity, connection and normalized arguments; permissions are rechecked before execution. See [skills and connectors](skills-and-connectors.md). Memory saves and bot creation use the older proposal flow; main-bot creation is reviewed and new instructions do not confer authority.

Memory files contain a JSON metadata comment followed by Markdown. FTS is derived and rebuilt when read, recovering external edits and removing missing records. Atomic file replacement precedes indexing; interrupted writes reconcile on the next read. Approval IDs are deterministic memory IDs, so a repeated interrupted save writes the same record. Private memory never becomes template metadata automatically.

On restart, pending approvals remain; active tasks become explicitly interrupted instead of being replayed. Historical board records are retained; board execution and routes have been removed. An external write that was executing becomes `unknown` and is reconciled, never replayed. Crash-proof model checkpoint/resumption remains a future runtime deliverable.

## Private phone milestone endpoints

| Method | Endpoint | Behaviour |
| --- | --- | --- |
| GET | `/api/remote/status` | Authenticated enabled/origin/localOwner. Only local sessions receive target, port, CLI presence, Serve commands and changed-target status. Presence is not network readiness. |
| POST | `/api/remote/settings` | Local owner only: `{enabled,origin}`; one exact HTTPS machine.tailnet.ts.net origin. Disabling or changing origin revokes all remote sessions. Saving acknowledges the current target. |
| POST | `/api/devices/pair` | Local owner only, remote enabled: five-minute single-use `{token,code,expiresAt}`. Link/QR generated on the local UI. |
| POST | `/api/remote/pair` | Configured enabled remote origin only; unauthenticated exchange `{challenge,label}` with bounded attempts. Sets Secure cookie and redirects to `/`. |
| GET | `/api/devices` | `{currentDeviceId,devices}`; local owner sees latest 200 records, phone sees only itself; no token/hash. |
| POST | `/api/devices/:id/revoke` | Local owner revokes one device and closes its responses. |
| POST | `/api/devices/revoke-remote` | Local owner revokes every remote session and pending challenge, including records beyond the list page. |
| POST | `/api/devices/signout` | Authenticated device revokes itself. |
| GET | `/api/chats/:id?since=<lastEventId>` | Authenticated authoritative snapshot: messages (last 500), tasks (last 100), lastEventId. Supports bot or group IDs. Includes mutable partial replies; since is a hint, not an append-only replay cursor. |

Phone POSTs to chat, groups/chat, tasks/cancel, approvals and actions/resolve require `Idempotency-Key` (16–128 letters/digits/underscore/hyphen). Local callers can opt in too. Equal device/key/payload replays the receipt, changed payload returns 409, an uncertain reservation never blindly executes again. Chat replay returns JSON `{taskId,replayed:true}` instead of a new stream. Recover saved state using the chat endpoint. Generic group retry also supports keys locally but is deliberately not exposed to the phone in this milestone.

Remote reads are limited to state, messages, group messages, memory, chat snapshots, own device and remote status. Remote writes additionally permit reactions, sidebar bot layout and model selection. Provider/connector setup, grants, package lifecycle/import/export and new unreviewed routes remain local-only and return “Do this on your laptop.” Provider secrets remain behind the Electron credential bridge. Phone text attachments use the existing bounded text payload; no arbitrary host path is accepted.

Revoking a device closes its stream but does not cancel accepted host work or undo external effects. Explicit cancellation uses the same runtime controller. On process restart, existing interrupted-task and unknown-write policies still apply; remote access adds no checkpoint engine or task replay.
