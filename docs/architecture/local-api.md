# Local API and extension boundaries

Electron supervises a Node utility process that binds `127.0.0.1` on an ephemeral port. Browser mode uses a configured port. A one-time pairing URL sets an HttpOnly/SameSite=Strict cookie and redirects to remove the token. All API requests require the session. Mutations also require the exact local Origin. Unexpected Host and cross-site requests are rejected; CORS access is not granted.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/state` | Bots, catalog releases, installations, connections, actions, tasks, approvals, activity and settings; no stored key or token |
| POST | `/api/bots` | Create private bot from name, role, instructions |
| GET | `/api/messages?botId=` | Persistent bot conversation |
| POST | `/api/chat` | Start bounded task and stream NDJSON |
| POST | `/api/tasks/cancel` | Abort active task by ID |
| POST | `/api/install/preview` | Exact dependency plan with source, trust, installed versions, requested and newly requested capabilities, and plan digest |
| POST | `/api/install` | `{id,version,digest,consent}`: verify digest, consent and file integrity, then atomically record receipts; instantiate bot roots |
| POST | `/api/installations/enable` | Enable or disable an installed package |
| POST | `/api/installations/uninstall` | Remove a receipt unless another package depends on it; revoke connector connections |
| POST | `/api/installations/rollback` | Restore the previous release when it needs no new consent |
| POST | `/api/skills/import` | `{label,files:[{path,content(base64)}]}`: validate and stage an Agent Skills directory as a local-unverified release (8 MB limit) |
| POST | `/api/templates/import` | Import an exported bot template JSON as a local-unverified release |
| POST | `/api/export/skill/preview`, `/api/export/skill` | Review, then write a standard skill directory under `exports/` |
| POST | `/api/export/bot/preview`, `/api/export/bot` | Review an allowlisted template draft; flagged text needs `acknowledge` |
| GET | `/api/registry?search=&cursor=` | Cached, metadata-only MCP Registry page with Socius review status |
| POST | `/api/connectors/connect` | Start OAuth sign-in; returns the provider URL (desktop opens the system browser) |
| GET | `/oauth/callback` | Provider redirect; authenticated by one-time state instead of the session cookie |
| POST | `/api/connectors/verify` | Re-check credentials and upstream tool schemas |
| POST | `/api/connectors/disconnect` | Revoke (best effort) and delete stored credentials |
| POST | `/api/actions/resolve` | Approve or decline an exact external write by digest |
| POST | `/api/actions/check` | Re-check an unknown outcome without repeating the write |
| POST | `/api/actions/retry` | Retry only after Socius confirmed the write did not happen |
| POST | `/api/approvals` | Apply/decline a pending proposal with exact digest and expiry |
| GET | `/api/memory?botId=&q=` | Reconcile/read/search scoped Markdown memory |
| POST | `/api/memory` | User editor creates/updates a record |
| DELETE | `/api/memory` | User editor deletes record and derived index entry |
| POST | `/api/grants` | `{botId,memory}` or `{botId,capability:"documents.read"|"documents.write",granted}` |
| POST | `/api/settings` | Provider/model/endpoint and optional OS-encrypted credential |

Chat input: `{botId,content,attachment?:{name,text}}`. Events: `started` with task ID, `text` with cumulative text, `done`, or `error`. Disconnecting does not cancel work; saved progress can be read again. One task per bot runs at a time, with six model steps and a three-minute timeout.

## Ownership

- `apps/desktop`: lifecycle, runtime supervision and OS encryption over a private parent/child channel. No renderer credential IPC.
- `apps/web/src/views`: independent chat, marketplace, memory, activity, settings and creation views.
- `packages/contracts`: manifests and application DTOs.
- `packages/marketplace`: releases, trust, dependency planning, MCP Registry adapter, export review and private instantiation.
- `packages/skills`: Agent Skills `SKILL.md` import/export and safe directory reading.
- `packages/connectors`: reviewed connector actions and the MCP client.
- `packages/runtime/src/packages.ts`, `connections.ts`, `broker.ts`: package lifecycle, OAuth credentials and the shared action broker.
- `packages/runtime/src/model.ts`: AI SDK adapter and capability-gated tools.
- `packages/runtime/src/server.ts`: auth, validation, installation/approval orchestration and streaming.
- `packages/runtime/src/store.ts`: SQLite records, Markdown memory and derived FTS index.

## Extending actions

Register connector actions in reviewed runtime code (`packages/connectors`) and route every call through `ActionBroker.request`. Proposal creation is side-effect-free. Approvals bind actor (bot, task, optional board/run), release identity, connection and normalized arguments; permissions are rechecked before execution. See [skills and connectors](skills-and-connectors.md). Memory saves and bot creation use the older proposal flow; main-bot creation is reviewed and new instructions do not confer authority.

Memory files contain a JSON metadata comment followed by Markdown. FTS is derived and rebuilt when read, recovering external edits and removing missing records. Atomic file replacement precedes indexing; interrupted writes reconcile on the next read. Approval IDs are deterministic memory IDs, so a repeated interrupted save writes the same record. Private memory never becomes template metadata automatically.

On restart, pending approvals remain; active tasks become explicitly interrupted instead of being replayed. An external write that was executing becomes `unknown` and is reconciled, never replayed. Crash-proof model checkpoint/resumption and delegation remain future runtime deliverables.
