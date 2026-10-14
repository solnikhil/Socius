# Local API and extension boundaries

Electron supervises a Node utility process that binds `127.0.0.1` on an ephemeral port. Browser mode uses a configured port. A one-time pairing URL sets an HttpOnly/SameSite=Strict cookie and redirects to remove the token. All API requests require the session. Mutations also require the exact local Origin. Unexpected Host and cross-site requests are rejected; CORS access is not granted.

| Method      | Endpoint                                         | Behavior                                                                                                                                                           |
| ----------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET         | `/api/state`                                     | Bots, catalog releases, installations, connections, actions, tasks, approvals, activity, provider connections, models and selection; no stored credential or token |
| POST        | `/api/bots`                                      | Create private bot from name, role, instructions                                                                                                                   |
| GET         | `/api/messages?botId=`                           | Persistent bot conversation                                                                                                                                        |
| POST        | `/api/chat`                                      | Start bounded task and stream NDJSON                                                                                                                               |
| POST        | `/api/tasks/cancel`                              | Abort active task by ID                                                                                                                                            |
| POST        | `/api/install/preview`                           | Exact dependency plan with source, trust, installed versions, requested and newly requested capabilities, and plan digest                                          |
| POST        | `/api/install`                                   | `{id,version,digest,consent}`: verify digest, consent and file integrity, then atomically record receipts; instantiate bot roots                                   |
| POST        | `/api/installations/enable`                      | Enable or disable an installed package                                                                                                                             |
| POST        | `/api/installations/uninstall`                   | Remove a receipt unless another package depends on it; revoke connector connections                                                                                |
| POST        | `/api/installations/rollback`                    | Restore the previous release when it needs no new consent                                                                                                          |
| POST        | `/api/skills/import`                             | `{label,files:[{path,content(base64)}]}`: validate and stage an Agent Skills directory as a local-unverified release (8 MB limit)                                  |
| POST        | `/api/templates/import`                          | Import an exported bot template JSON as a local-unverified release                                                                                                 |
| POST        | `/api/export/skill/preview`, `/api/export/skill` | Review, then write a standard skill directory under `exports/`                                                                                                     |
| POST        | `/api/export/bot/preview`, `/api/export/bot`     | Review an allowlisted template draft; flagged text needs `acknowledge`                                                                                             |
| GET         | `/api/registry?search=&cursor=`                  | Cached, metadata-only MCP Registry page with Socius review status                                                                                                  |
| POST        | `/api/connectors/connect`                        | Start OAuth sign-in; returns the provider URL (desktop opens the system browser)                                                                                   |
| GET         | `/oauth/callback`                                | Provider redirect; authenticated by one-time state instead of the session cookie                                                                                   |
| POST        | `/api/connectors/verify`                         | Re-check credentials and upstream tool schemas                                                                                                                     |
| POST        | `/api/connectors/disconnect`                     | Revoke (best effort) and delete stored credentials                                                                                                                 |
| POST        | `/api/actions/resolve`                           | Approve or decline an exact external write by digest                                                                                                               |
| POST        | `/api/actions/check`                             | Re-check an unknown outcome without repeating the write                                                                                                            |
| POST        | `/api/actions/retry`                             | Retry only after Socius confirmed the write did not happen                                                                                                         |
| POST        | `/api/approvals`                                 | Apply/decline a pending proposal with exact digest and expiry                                                                                                      |
| GET         | `/api/memory?botId=&q=`                          | Reconcile/read/search scoped Markdown memory                                                                                                                       |
| POST        | `/api/memory`                                    | User editor creates/updates a record                                                                                                                               |
| DELETE      | `/api/memory`                                    | User editor deletes record and derived index entry                                                                                                                 |
| POST        | `/api/grants`                                    | `{botId,memory}` or `{botId,capability:"documents.read"                                                                                                            | "documents.write",granted}` |
| POST        | `/api/providers`                                 | Create a provider connection: `{provider,label?,config,secrets}`; secrets OS-encrypted                                                                             |
| POST        | `/api/providers/update`                          | Edit label/config; `secrets` values replace, `null` removes, omitted keep. Endpoint change drops the old key                                                       |
| DELETE      | `/api/providers`                                 | Remove a connection and its models/selections                                                                                                                      |
| POST        | `/api/providers/test`                            | Verify credentials: list models, or a short call to an added model; records status                                                                                 |
| GET         | `/api/providers/models?id=&refresh=1`            | Discover chat models from the provider's own catalog API (cached)                                                                                                  |
| POST        | `/api/models`                                    | Add a model `{connectionId,modelId,label?}`; first one becomes default                                                                                             |
| DELETE      | `/api/models`                                    | Remove a model; selections using it are cleared                                                                                                                    |
| POST        | `/api/models/test`                               | Real text call plus tool-call check; records tool support                                                                                                          |
| POST        | `/api/models/select`                             | `{botId                                                                                                                                                            | null, model                 | null}`: set workspace default or a per-bot override |
| POST        | `/api/boards`                                    | Create a board with any number of members and a coordinator                                                                                                        |
| GET         | `/api/boards/detail?id=`                         | Board, sources, runs, tasks and thread                                                                                                                             |
| POST        | `/api/boards/update`                             | Edit brief, coordinator, budgets; archive or restore                                                                                                               |
| POST/DELETE | `/api/boards/members`                            | Add a member or edit its board role / remove a non-coordinator                                                                                                     |
| POST/DELETE | `/api/boards/sources`                            | Share or remove a text source                                                                                                                                      |
| POST        | `/api/boards/runs`                               | Start a background team run (202)                                                                                                                                  |
| POST        | `/api/boards/runs/approve`                       | Run a plan awaiting review (a new message revises it instead)                                                                                                      |
| POST        | `/api/boards/runs/cancel`, `/runs/retry`         | Stop a run or discard a pending plan; retry outstanding work                                                                                                       |
| POST        | `/api/boards/tasks/cancel`, `/api/boards/stop`   | Cancel one task; stop every active run on a board                                                                                                                  |

Board semantics, budgets, restart behaviour and examples: [Teams & Boards](teams.md).

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
- `packages/teams`: board schemas, plan validation and the team run engine (no IO); `packages/runtime/src/boards.ts` and `team-store.ts` adapt it to HTTP and SQLite.

## Extending actions

Register connector actions in reviewed runtime code (`packages/connectors`) and route every call through `ActionBroker.request`. Proposal creation is side-effect-free. Approvals bind actor (bot, task, optional board/run), release identity, connection and normalized arguments; permissions are rechecked before execution. See [skills and connectors](skills-and-connectors.md). Memory saves and bot creation use the older proposal flow; main-bot creation is reviewed and new instructions do not confer authority.

Memory files contain a JSON metadata comment followed by Markdown. FTS is derived and rebuilt when read, recovering external edits and removing missing records. Atomic file replacement precedes indexing; interrupted writes reconcile on the next read. Approval IDs are deterministic memory IDs, so a repeated interrupted save writes the same record. Private memory never becomes template metadata automatically.

On restart, pending approvals remain; active tasks become explicitly interrupted instead of being replayed. Board runs follow the same rule: active runs become interrupted and resume only by explicit retry. An external write that was executing becomes `unknown` and is reconciled, never replayed. Crash-proof model checkpoint/resumption remains a future runtime deliverable.
