# Skills, connectors and the action broker

Tracking: [issue #3](https://github.com/solnikhil/Socius/issues/3). This records what is implemented, how to set it up, and what remains.

## Standard skills (`packages/skills`)

Socius imports and exports [Agent Skills](https://agentskills.io/specification) directories: a folder whose `SKILL.md` has YAML frontmatter and Markdown instructions, plus optional resources.

- **Frontmatter:** `name` (required; lowercase letters, digits, single hyphens; must equal the directory name), `description` (required, ≤1024), `license`, `compatibility` (≤500), `metadata` (string → string), `allowed-tools`. Unknown fields are rejected. YAML anchors and aliases are rejected. Duplicate keys are rejected.
- **Versions:** `metadata.version` must be `MAJOR.MINOR.PATCH`. Without it the release is `0.0.0`. A release identity (`local/<name>@<version>`) never changes: importing different content under an existing identity fails and asks for a version bump.
- **Socius extensions** stay inside `metadata` so files remain standard: `socius-capabilities` (space-separated capability requests) and `socius-dependencies` (`publisher/name@1.2.3`).
- **Instruction-only.** Files under `scripts/` are stored inert and are never executed or loaded into model context. Frontmatter that asks for activation (`entrypoint`, `command`, `hooks`, `mcp-servers`, …) is rejected. Native executables are rejected anywhere (by extension and by ELF/PE/Mach-O magic bytes). Script-like files outside `scripts/` are rejected.
- **`allowed-tools`** is recorded and shown as a request. It never adds tools or permissions.
- **Safe reading:** path traversal, absolute paths, drive letters, backslashes, case-insensitive duplicates, multiple roots, symbolic links and Windows junctions are rejected. Limits: 200 files, 1 MiB per file, 5 MiB total, depth 8. Hidden dot-files are ignored and reported.
- **Progressive loading:** bots see only installed skill names and descriptions. `loadSkill` returns the full instructions plus a list of reference files; `readSkillResource` reads one UTF-8 reference (≤64 KiB) after re-verifying its hash.
- **Export** writes a standard directory (`serializeSkill`) that imports back to the same manifest.

An example skill lives in [`examples/skills/document-brief`](../../examples/skills/document-brief).

## Releases, trust and lifecycle

Every catalog entry is a `Release`: manifest, sha-256 digest of the canonical manifest (resource hashes included), source and trust.

| Trust | Meaning |
| --- | --- |
| `curated` | Bundled with Socius after review. |
| `reviewed` | Downstream MCP Registry entry whose exact name, version and remote URL match a Socius review. |
| `local-unverified` | Imported by the user. The digest proves the content has not changed since import; it does not prove who wrote it. |

Upstream MCP identities (`com.notion/mcp@1.0.1`) are kept in `source`/`upstream`, separately from Socius `publisher/name` IDs.

Install flow: **inspect → review dependencies and permissions → verify integrity and trust → consent → stage → atomically install → configure.**

- Imports are written to `packages/staging/<uuid>`, re-hashed, then renamed into the content-addressed store `packages/releases/<digest>`. Startup deletes staging leftovers and release folders without a release record, so an interrupted import never leaves an active partial package. Activation is a single SQLite transaction writing receipts.
- Installation re-hashes every stored file; tampering fails with an integrity error.
- `POST /api/install` requires consent for every capability not already consented for that package. Updates that request more require fresh consent. Consent is not a bot grant.
- Connectors install only with a matching reviewed runtime implementation (`verifyManifest`) and never from `local-unverified` releases.
- Enable/disable, update, rollback (to the previous recorded release, only if it needs no new consent and its exact dependencies are installed) and uninstall (blocked while another installed package depends on it). Receipts keep up to 10 history entries. Uninstalling a connector also revokes its connection.
- Releases with `minRuntime` newer than the runtime are listed as incompatible and cannot be planned.

## MCP Registry adapter (`packages/marketplace/src/registry.ts`)

Socius is a curated downstream of the official registry (`/v0.1/servers`). The adapter fetches metadata only: no credentials (`credentials: "omit"`), no redirects, an 8 s timeout and a 2 MB limit. Results are cached in memory and in SQLite for 10 minutes. On failure it returns the last cached page marked `stale`, or an error. Inactive and malformed entries are skipped and counted. Pagination uses the registry cursor.

Only servers in `reviewedServers` with a matching name, version and streamable-HTTP URL link to an installable connector. Everything else is labelled “discovery only”. Discovery never spawns a process or connects to a listed server.

## Notion connector (`packages/connectors`)

**Choice:** Notion's official hosted MCP server, `com.notion/mcp` (`https://mcp.notion.com/mcp`, streamable HTTP). It supports OAuth 2.1 with dynamic client registration, PKCE (S256) and a revocation endpoint. Socius never runs a local MCP process for it.

**Reviewed actions** (the only ones a bot can reach):

| Action | Access | Capability | Upstream tool |
| --- | --- | --- | --- |
| `notion.search` | read | `documents.read` | `notion-search {query}` |
| `notion.fetch` | read | `documents.read` | `notion-fetch {id}` |
| `notion.create-page` | write, approval required | `documents.write` | `notion-create-pages {parent:{page_id}, pages:[{properties:{title}, content}]}` |

Arguments are validated by strict schemas: page references must be Notion IDs or `https://*.notion.so|site` URLs and are normalized; the title is one line (≤200); content is ≤20 000 characters. Remote content goes back to the model labelled as untrusted data, truncated at 12 000 characters.

**Scopes.** Notion's server offers only the `default` OAuth scope, which covers whatever pages the user shares during sign-in. Narrowing happens in Socius: the action allowlist above, per-bot grants for read and write separately, and per-call approval for writes. When connecting, Socius calls `tools/list` and marks the connection `unsupported` if a reviewed tool or input property disappeared (schema drift).

### Setup

1. Use the desktop app (`npm run desktop`). Account connections need OS-backed encryption, so browser mode reports **Unsupported here**.
2. Connect Apps → Notion → consent to the requested permissions → **Install connector**.
3. **Connect Notion** opens Notion's sign-in in your system browser. Choose the pages to share and approve.
4. The browser returns to `http://127.0.0.1:<port>/oauth/callback`. The one-time `state` (10-minute expiry, single use) binds it to the sign-in you started.
5. Back in Socius, tick **Read** and/or **Propose changes** for each bot that should use it.

### Credentials

- Tokens, client registration, PKCE verifier and discovery state are one JSON blob, encrypted through Electron `safeStorage` (the existing `SecretBox`) and stored in a separate `connector_secrets` table. They never appear in `/api/state`, activity, model context or logs.
- Desktop ports are ephemeral, so a new sign-in re-registers the client for the current redirect URI. Refresh tokens keep working between launches.
- Bot actions never start a sign-in. An expired or revoked grant sets the connection to **Authentication required**.
- Sessions on one connection run one at a time, so parallel tool calls share a single token refresh and never overwrite each other's stored credentials. A failed decrypt fails the call instead of falling back to empty state.
- **Disconnect** asks the provider to revoke the token (best effort), deletes the local blob and marks the connection `disconnected`. The next connect creates a new connection ID, so approvals bound to the old account stay blocked.

**Nango.** Not adopted for V1. Nango is a hosted or self-hosted OAuth broker that needs a server we would operate. Notion's MCP endpoint already supports standards-based DCR + PKCE, which the MCP SDK implements client-side, and secrets stay on the user's machine. Credential handling sits behind `ConnectionService`, so a broker can replace it later when Socius owns integrations without MCP OAuth.

**Connection states** shown in the UI: Ready, Authentication required, Disconnected, Unsupported (secure storage missing or upstream schema drift), Failed (service unreachable), plus Not installed and Disabled.

## Action broker (`packages/runtime/src/broker.ts`)

This is the single external-action policy point for single bots, group member tasks and delegated work.

```ts
import type { ActionRequest } from "@socius/contracts";
// {
//   actor: { botId, taskId, boardId?, runId? },
//   release: { id, version, digest },        // installed connector release
//   action: "notion.create-page",             // reviewed action ID only
//   arguments: { ... }                        // validated by the action schema
// }
const result = await runtime.broker.request(request);
// { status: "completed", summary, data } for reads
// { status: "awaiting-approval", actionId, summary } for writes
```

Callers cannot supply code, tool names outside the reviewed list or permissions. Every request and every execution rechecks: the bot exists; the connector is installed, enabled and matches the requested release digest and reviewed code; the capability was consented at install; the bot holds the grant; the connection is ready; the arguments parse. A coordinator or parent task confers nothing; checks use the acting bot's own grants. Roster size does not matter.

**Writes** create a durable `ActionRecord` whose digest binds actor, release, action, connection ID, normalized arguments and expiry (24 h). Approval (`POST /api/actions/resolve`) requires the matching digest, recomputes it to detect tampering, rejects expired records and re-authorizes. Failed checks mark the record `blocked`. Approved records execute once.

**Idempotency and reconciliation.** Notion has no idempotency keys, so Socius does not promise exactly-once effects.

1. Before writing, the broker records a baseline: the number of child pages with the same title under the parent.
2. The attempt is persisted as `executing` before any remote call.
3. Outcomes are classified by what they prove: `auth`, `rate-limited` and `rejected` mean nothing happened (`failed`, retryable by the user only). Timeouts, disconnects and 5xx responses are `ambiguous`: the record becomes `unknown` and Socius checks once, counting same-titled children again. A higher count marks it `succeeded` (“confirmed by checking”). Otherwise it stays `unknown` and not retryable.
4. **Check again** repeats only the read. Retry becomes available only when the check actually ran and the page is absent, with a warning that a slow service could still produce a duplicate. If the check cannot run (offline, signed out, no pre-write snapshot), the outcome stays unknown.
   Failures before the write request is sent (unreachable service, failed pre-write check) are definite failures, not unknown outcomes.
5. Retries are never automatic, are capped at 3 attempts, and re-run every authorization check.
6. If the runtime stops mid-write, the `executing` record becomes `unknown` on restart and is never replayed.

Limits: 20 reads and 5 pending proposals per task; the model loop is still bounded at 6 steps.

## Export

- **Skills:** `POST /api/export/skill/preview` returns the files and review findings. `POST /api/export/skill` writes `exports/<time>-<name>/<name>/`.
- **Bot templates:** built from an explicit allowlist (name, description, role, instructions, version, license, the template's requested capabilities, and dependencies that are installed). Chats, memory, credentials, granted permissions, routines and connections are never read.
- **Review:** free text is scanned for emails, phone numbers, URLs, token-like strings, home-directory paths and verbatim copies of the bot's memory. Findings must be acknowledged. Any edit invalidates the reviewed digest. The scanner is a review aid, not a guarantee.
- Exported templates re-import with `POST /api/templates/import` as `local-unverified` releases. Public hosted publishing is not implemented.

## Migrations

`migrations` version 2:

- creates `connector_secrets(connection_id, secret, updated_at)`;
- upgrades installation receipts with `enabled` (true), `source` (bundled), `trust` (curated), `consentedCapabilities` ([]) and `history` ([]).

New record kinds: `release`, `connection`, `action`, `registry-cache`. The curated Notion entry moves from the non-installable `0.1.0` placeholder to `0.2.0`.

## Verification

- `packages/skills/test`: parsing, rejection cases, symlink/junction escapes, round-trip export.
- `packages/marketplace/test/registry.test.ts`: review matching, pagination, stale cache, failure handling, no credentials, review scanner, template allowlist.
- `packages/connectors/test`: manifest/code agreement, ID normalization, schema drift, failure classification.
- `packages/runtime/test/connectors.test.ts` runs against a fixture MCP server with a real OAuth 2.1 flow (DCR, PKCE, refresh, revocation). It covers the winning flow, restart, tampering, expiry, revoked grants, disabled connector, board actors, disconnect/reconnect, uninstall, 429, timeout-after-success, ambiguous-absent, crash recovery, connection states, skill lifecycle and bot export.
- `e2e/workspace.spec.ts` runs the winning workflow through the real UI, including the browser sign-in popup.

**Controlled live check (not run in CI).** With a test Notion workspace:

1. Share one page during sign-in.
2. Grant Socius read and write.
3. Ask for a brief of that page and to save it under the same page.
4. Approve the proposal.
5. Confirm the new page in Notion and the `action.succeeded` activity record.
6. Disconnect, and confirm that Notion's *Connections* settings no longer list Socius.

## Known limitations

- The live Notion check above has not been run by the author of this change. Upstream tool argument shapes come from Notion's documentation and are checked at connect time.
- One active connection per connector. Multiple Notion accounts at once are not supported.
- A sign-in started before a runtime restart must be started again (pending OAuth flows live in memory).
- Reconciliation detects new pages by title under the parent. Concurrent edits by someone else creating an identically titled page during the same window could be miscounted.
- Browser mode cannot connect accounts, because it has no OS-backed encryption.
- Release trust has no publisher signatures yet. `curated`/`reviewed` reflect Socius review; registry metadata is not cryptographically verified.
- Only Notion is implemented. Calendar and other connectors follow the same `ReviewedConnector` contract.

## Requested connector directory

Connect Apps hides the Skills catalog and skill import for now. Skill packages, import and export remain in the runtime for a later release.

Connect Apps → Connectors lists Indian services as searchable **Planned** rows, grouped by payments, travel, food, documents, government, telecom, work and health. The current set is Razorpay, Cashfree, PhonePe, Paytm, IRCTC, redBus, MakeMyTrip, IndiGo, Air India, Ola, Zomato, Swiggy, Blinkit, Zepto, DigiLocker, India Post, GST, UMANG, Airtel, Jio, Vi, Zoho and Practo. `packages/marketplace/src/connector-directory.ts` holds these discovery entries separately from installable, verified releases. They have no authentication endpoints, executable adapters, tools or permission grants. A listing disappears automatically when a compatible release with its ID is available.

Razorpay (`https://mcp.razorpay.com/mcp`) and Cashfree (`https://mcp.cashfree.com`) publish hosted MCP servers. Those servers sign in with an API key. Socius connector sign-in completes through OAuth, so neither server is reviewed or connectable yet. Connect Apps → MCP Registry has India, Razorpay, Cashfree, Zoho and Rail shortcuts that search the official registry. A result can be installed only when its exact name, version and remote URL match `reviewedServers`. Notion remains the only reviewed connector.

Each integration still needs a supported access method, account authentication, reviewed action schemas, capability enforcement, approval rules and end-to-end account validation before becoming connectable. The existing Notion integration retains its normal installation and authentication flow.

Boards were retired on 2026-10-14. New connector calls originate in direct or group chats. Optional board/run actor metadata remains readable for historical approval and audit records.
