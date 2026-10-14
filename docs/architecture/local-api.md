# Local API and extension boundaries

Electron supervises a Node utility process that binds `127.0.0.1` on an ephemeral port. Browser mode uses a configured port. A one-time pairing URL sets an HttpOnly/SameSite=Strict cookie and redirects to remove the token. All API requests require the session. Mutations also require the exact local Origin. Unexpected Host and cross-site requests are rejected; CORS access is not granted.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/state` | Bots, catalog, installations, tasks, approvals, activity, provider connections, models and selection; no stored credential |
| POST | `/api/bots` | Create private bot from name, role, instructions |
| GET | `/api/messages?botId=` | Persistent bot conversation |
| POST | `/api/chat` | Start bounded task and stream NDJSON |
| POST | `/api/tasks/cancel` | Abort active task by ID |
| POST | `/api/install/preview` | Exact dependency plan and reviewed-content digest |
| POST | `/api/install` | Verify digest, atomically record curated packages; instantiate bot roots |
| POST | `/api/approvals` | Apply/decline a pending proposal with exact digest and expiry |
| GET | `/api/memory?botId=&q=` | Reconcile/read/search scoped Markdown memory |
| POST | `/api/memory` | User editor creates/updates a record |
| DELETE | `/api/memory` | User editor deletes record and derived index entry |
| POST | `/api/grants` | Enable/revoke memory access for one bot |
| POST | `/api/providers` | Create a provider connection: `{provider,label?,config,secrets}`; secrets OS-encrypted |
| POST | `/api/providers/update` | Edit label/config; `secrets` values replace, `null` removes, omitted keep. Endpoint change drops the old key |
| DELETE | `/api/providers` | Remove a connection and its models/selections |
| POST | `/api/providers/test` | Verify credentials: list models, or a short call to an added model; records status |
| GET | `/api/providers/models?id=&refresh=1` | Discover chat models from the provider's own catalog API (cached) |
| POST | `/api/models` | Add a model `{connectionId,modelId,label?}`; first one becomes default |
| DELETE | `/api/models` | Remove a model; selections using it are cleared |
| POST | `/api/models/test` | Real text call plus tool-call check; records tool support |
| POST | `/api/models/select` | `{botId|null, model|null}`: set workspace default or a per-bot override |

Chat input: `{botId,content,attachment?:{name,text}}`. The bot's override, else the default model, is resolved before the task is recorded. Events: `started` with task ID, `text` with cumulative text, `done`, or `error` with a safe message and stable `code` (`unauthorized`, `model_not_found`, `unreachable`, `rate_limited`, `quota_exceeded`, `tools_unsupported`, `context_too_long`, …). Provider bodies are used for classification only and never returned, logged or persisted. If a model rejects tools before producing output, the task retries once without tools and the model is marked tool-less. Disconnecting does not cancel work; saved progress can be read again. One task per bot runs at a time, with six model steps and a three-minute timeout.

## Ownership

- `apps/desktop`: lifecycle, runtime supervision and OS encryption over a private parent/child channel. No renderer credential IPC.
- `apps/web/src/views`: independent chat, marketplace, memory and creation views; `views/settings` is the Settings dialog (General, Models, Providers, Privacy).
- `packages/contracts`: manifests and application DTOs.
- `packages/marketplace`: curated releases, dependency planning and private instantiation.
- `packages/contracts/src/providers.ts`: provider descriptors (fields, env fallbacks, discovery, destination) and connection/model DTOs.
- `packages/runtime/src/providers`: one AI SDK factory per provider, model discovery, model checks, error classification and the connection service.
- `packages/runtime/src/model.ts`: streaming tool loop and capability-gated tools.
- `packages/runtime/src/server.ts`: auth, validation, installation/approval orchestration and streaming.
- `packages/runtime/src/store.ts`, `migrations.ts`, `provider-store.ts`: versioned SQLite schema, records, provider tables, Markdown memory and derived FTS index. Migration 2 imports v1 single-provider settings.

## Extending actions

Register connector actions in reviewed runtime code. Proposal creation must be side-effect-free. Approval must bind user/bot/task/action arguments and release identity; recheck permissions before execution. Current proposals support only memory saves and bot creation. Main-bot creation is reviewed; new instructions do not confer authority.

Memory files contain a JSON metadata comment followed by Markdown. FTS is derived and rebuilt when read, recovering external edits and removing missing records. Atomic file replacement precedes indexing; interrupted writes reconcile on the next read. Approval IDs are deterministic memory IDs, so a repeated interrupted save writes the same record. Private memory never becomes template metadata automatically.

On restart, pending approvals remain; active tasks become explicitly interrupted instead of being replayed. Crash-proof model checkpoint/resumption, durable external-action reconciliation and delegation remain future runtime deliverables.
