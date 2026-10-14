# Product expansion: complete feature work packages

Status: specification for review, not implementation. Owner: unassigned; the user assigns work. This document expands every item in the [roadmap additions](../roadmap.md) into an assignable scope and acceptance contract. Existing features are not evidence that these additions are delivered.

## Coverage and priority

The user's original numbering is preserved here so no request disappears during regrouping.

| User item | Roadmap ID | Requested outcome | Work package / dependency |
| --- | --- | --- | --- |
| 1 | A07 | Hand work to bots from Socius's direct chat, with approval each time, and bring answers back | Highest-priority new orchestrator gap; durable task/action hooks from A04 |
| 2 | A03 | “Every Monday, have Planner draft my week”; off until enabled, runs in Activity | Existing [Issue #10](https://github.com/solnikhil/Socius/issues/10), including A04/A05; no second scheduler |
| 3 | A08 | Grant bots permission to search the web | Reviewed search adapter and runtime authorization |
| 4 | U07 | Find information across all chats and memory | Shared source identities, indexing and scope rules |
| 5 | U08 | Edit/resend or branch from any point | Immutable message revisions, branch ancestry, action provenance |
| 6 | U09 | Pin important chat replies | Stable message/revision links, persistent pins |
| 7 | U10 | On-device dictation in the composer | Desktop permission/recognition boundary; verified local processing |
| 8 | U11 | Drop images and PDFs into supported models | Durable attachments, model input capabilities; coordinate U02 parsing |
| 13 | O01 | Per-bot cost/token usage, biggest consumers, monthly cap | Shared metering, pricing snapshots, atomic budget reservations |
| 14 | O02 | Bot health from reactions, failures and usage | Transparent metric definitions and evidence navigation |

Only direct delegation has been explicitly prioritized above the other additions. The sequence below reflects technical dependencies, not promised dates or invented assignees.

## Shared foundation and ownership

Read [architecture](../architecture/v1.md), [local API](../architecture/local-api.md), [team handoff](../team-handoff.md) and [AGENTS.md](../../AGENTS.md) before implementing. The user owns visual/UI refinement; agree payloads and focused UI integration first. Shared contract/runtime/store/model/provider hooks must be coordinated with current workstreams. Preserve concurrent changes.

- Keep private bot instances, memories, credentials, routines and conversation data out of published templates. Grants are runtime state; manifest requests and model instructions confer no authority.
- Group chats are the only shared collaboration surface. Direct delegation below is a scoped parent/child task, not a new board. Preserve historical board records and never restore board execution/UI.
- Use the existing paired-session/origin protections, provider services, action/approval broker and cancellation boundary. Extend contracts without importing SDK-specific types into domain DTOs. Do not introduce a second permission engine.
- Define stable identifiers for conversations, message revisions, branches, tasks/attempts, sources and artifacts before attaching search/pins/evidence to them. Preserve the actual bot, model, branch and revision used by each historical result.
- Persist intent before side effects. Recheck consent, grants, revision and ownership after asynchronous work and before effects. Changed content cannot reuse old approval; uncertain external effects require reconciliation, not blind replay.
- Foreground chat, delegated work, groups, Dreaming and routines share concurrency/provider-budget hooks. [Dreaming #8](https://github.com/solnikhil/Socius/issues/8) and its unmerged [draft PR #9](https://github.com/solnikhil/Socius/pull/9) remain separate; do not depend on an unmerged implementation or duplicate its memory service.
- Each package specifies pagination/limits, redacted diagnostics, lifecycle/deletion, migrations, restart recovery and accessible loading/empty/error/unsupported states. No collection silently grows without a retention policy.

## A07 — Approved delegation from direct chat

**User flow.** In Socius's direct chat, ask Writer for a pricing brief. Socius proposes the named bot, exact task and the context to share. The user approves that specific proposal; only then does Writer run. Show progress and return Writer's attributed result to the same parent conversation, including after reconnect/restart.

- [ ] Define a dedicated proposal/action type, parent task, child task and delivery record. Bind approval to target bot, exact task, context/source revisions, originating conversation/branch, permissions requested, expiry and relevant configuration. Show cost/context disclosure before approval where available.
- [ ] Denial, expiry, changed task/context, bot deletion and revoked access prevent dispatch. A target or parameter change requires a new proposal; no approval-by-inference from Socius's instructions. Approvals and action records survive restart.
- [ ] Give the specialist only the approved context plus its own allowed memory/skills/tools. Do not silently share Socius's full transcript, another bot's memory, unrelated group history or credentials. The parent receives the result, not an unrestricted view of specialist state.
- [ ] Keep the specialist's selected model and grants. Task approval authorizes delegation only; external writes still park at exact-action approval. Prompt injection in a source cannot grant authority or alter approved parameters.
- [ ] Reuse or extend the existing execution queue with bounded concurrency, depth, time/step/output limits, provider usage and recursion protection. Do not turn one approval into indefinite nested delegation.
- [ ] Persist waiting/approved/queued/running/awaiting-action/completed/failed/cancelled/unknown states as appropriate, with safe summaries. Cancellation reaches children and prevents late dispatch/delivery. A closed browser does not lose the run.
- [ ] Make retries explicit: reuse confirmed completed work where valid, preserve the original occurrence/action identity and reconcile unknown effects. Return a completed answer once; retrying delivery must not rerun the task or duplicate the reply.
- [ ] Define branch switching, parent message edits, specialist edits/removal and parent deletion while waiting/running. A stale branch cannot receive a result disguised as current work; retain a link to the original approved context.

**Acceptance.** Test approve/deny/expire/tamper; simultaneous approval requests; scope isolation; text-only and tool-capable models; recursion/budget limits; cancellation/revocation; provider failure; restart before/after dispatch and delivery; duplicate delivery; and external-write approval inside the child. A browser flow must return the attributed answer to the original direct chat. Group delegation alone does not pass.

## A03 — Routines, with A04/A05

The complete service scope and crash-test contract remain in [Issue #10](https://github.com/solnikhil/Socius/issues/10) and [its work package](../issues/scheduling-durability-proactivity.md). This section adds product-level traceability rather than a competing implementation.

- [ ] “Every Monday, have Planner draft my week” becomes a persisted private routine with bot/task, timezone, schedule preview, missed-run policy and enabled state. Creation/import/edit does not implicitly enable it.
- [ ] The user explicitly enables, pauses, manually runs or stops the routine, and inspects attempts/results, approval waits, skips and errors in Activity through stable links. Do not reintroduce a dedicated Activity tab by assumption.
- [ ] Reuse A04 checkpoint/recovery, exact approvals, stale-worker protection and unknown-effect reconciliation. Run with the bot's permissions and shared usage/cap enforcement.
- [ ] Document sleep/closed-app behavior, DST/clock changes, overlap, bounded catch-up and cancellation across restart. Local routines cannot promise always-on/cloud execution.
- [ ] Watchers/follow-ups use A05's persisted baselines, deduplicated delivery and quiet/no-change policy; morning briefs have an explicit scheduled-delivery/empty-content policy.

**Acceptance.** Issue #10's clock, failure, crash and browser matrix is required, including disabled-by-default state and visible Activity history. Do not mark A03 complete merely because the model recognizes schedule language.

## A08 — Permissioned web search

- [ ] Select and document a reviewed adapter, authentication/storage, data destination, pricing/limits and update owner. Store secrets through existing credential services; expose no key in the renderer or logs.
- [ ] Introduce explicit per-bot search consent/grants with revoke behavior. Template capability requests do not grant search. Check every direct/group/delegated/scheduled invocation at the runtime boundary, including after queued waits.
- [ ] Define strict bounded query, result count, timeout, retry and response schemas. Return titles, canonical source URLs, excerpts and observed time; clearly distinguish search snippets from fetched full-page evidence.
- [ ] Treat provider/web content as untrusted. Any URL fetch implementation needs redirect, network-address, protocol, content-type and byte limits; search must not become an arbitrary local-network/file fetch proxy. Provider metadata does not make a result trusted.
- [ ] Handle no results, duplicates, stale/partial results, rate limits, offline/auth failures and cancellation honestly. No fabricated browsing/source claims or silent provider fallback.
- [ ] Apply usage/rate limits and expose search-service charges separately where known. Search permission is not browser control, arbitrary network permission or permission for website writes.

**Acceptance.** Test denied/revoked grants across all call paths, malicious results, oversized responses, redirects/private-address fetch attempts when fetching exists, timeout/cancel, retry/rate limits, result attribution and missing setup. A real permitted query must return inspectable sources when a supported account is available; fixture evidence stays labelled.

## U07 — Search all chats and memory

- [ ] Search direct chats, group messages, message branches and private memory available to the user. Return bot/speaker, conversation/group, date, branch/revision, snippet and an exact source link; distinguish memory records from replies.
- [ ] Support keywords/phrases and filters for bot/speaker, chat/group, type, date and branch scope, with bounded pagination and stable ordering. Default to active branches; provide an explicit option for historical branches so they are still discoverable without confusing them with current answers.
- [ ] Index canonical stored text and any approved attachment-derived text, not credentials or arbitrary files. Rebuild/reconcile after migration, edits, external memory edits, deletions and restart; index state must not outlive a forgotten source in results/caches.
- [ ] Keep user-wide discovery separate from bot-visible context. A bot search tool is scoped to that bot and explicitly shared sources; it cannot inherit the UI's cross-bot access. Sharing a search hit with a bot is explicit and minimal.
- [ ] Show loading/no-match/partial-index/error states, safely highlight snippets, and open archived/historical sources with clear labels. Define behavior for deleted chats, removed bots and unavailable attachments.

**Acceptance.** Find “that thing Writer said about pricing” with correct attribution and exact-source navigation; test Unicode/phrases, filters, pagination, escaped malicious markup, branch history and permission boundaries. Editing/deleting/forgetting a source and restarting must remove stale results. Semantic search is optional later, not a prerequisite for useful local full-text search.

## U08 — Edit/resend and branch from any point

- [ ] Persist message revisions and explicit branch ancestry. Editing/resending creates a new user-message revision/path; original text and downstream replies remain reachable as history. Branching from a chosen point copies/references only that ancestry, never later turns.
- [ ] Provide edit/cancel/save-and-resend, branch selection, branch naming/identification and clear active-history state. Specify behavior during streaming, concurrent edits, group turns and when the parent is deleted.
- [ ] Bind generation to the selected branch/revision and chosen model. Correct a typo without reconstructing the entire chat; define which attachments and source references are retained/replaced.
- [ ] Do not execute copied tool calls or replay completed specialist/external work as part of history reconstruction. Changed inputs require fresh proposals/approvals. Keep prior actions visible as historical effects; a branch cannot undo a real-world action.
- [ ] Define deletion/retention for branch references, attachments, search entries, pins, reactions and memory source provenance. Existing conversations migrate to one default branch without data loss.

**Acceptance.** Test a root/middle/latest edit, branch from a user or bot reply, restart, switching branches, stream cancellation, double submission, stale approval, group-reply retry and attachment reuse. Show that only the selected ancestry reaches the provider and that historical effects are never replayed by branching.

## U09 — Pin important replies

- [ ] Pin/unpin stable message revisions within their own direct/group chat; prevent duplicate pins. Persist who/when/source identity where relevant and expose an accessible pinned-replies list with exact navigation.
- [ ] Define whether a pin references the original revision or a later one; default to the pinned revision with its branch labelled. Branch switching must not silently move a pin to different content.
- [ ] Handle edited/deleted messages, archived/deleted chats and missing attachments. Remove invalid pins or show an honest unavailable state according to the documented deletion policy; do not leave private content cached after deletion.
- [ ] Pins are user organization, not automatic memory, higher-priority model instructions or broader bot sharing. Include pinned text in model context only through an explicit, documented user-controlled feature.

**Acceptance.** Pin/unpin/reload/navigate in direct and group chats, test branch changes, duplicate requests, source deletion and keyboard operation. Plans and decisions remain easy to find without changing memory permissions.

## U10 — On-device dictation

- [ ] Select a desktop-native or bundled local recognizer only after validating on-device operation on each supported OS/language. Publish a support matrix and model/download/storage requirements; platform APIs are not assumed to be local merely because they are native.
- [ ] Request microphone access only on user action; show listening, local processing, stop/cancel and actionable permission/unsupported/error states. Release capture on stop, blur/navigation where appropriate, cancellation and shutdown.
- [ ] Insert partial/final text into the draft safely, preserving typed text/cursor and allowing correction before sending. No auto-send, accidental duplicate insertion or transmission of audio to the chat model.
- [ ] Keep audio/transcripts on device until the user sends edited text. Define ephemeral buffering/deletion and prohibit silent cloud recognition/telemetry fallback. Any future remote mode requires separate explicit consent and disclosure.
- [ ] Define shortcuts, accessibility, language choice, interruption behavior and runtime/main/preload boundaries without exposing unrestricted OS APIs to the renderer.

**Acceptance.** Verify actual local processing with network inspection/blocked-network tests as applicable, permission denied/revoked, unsupported OS/language, model download absent, rapid start/stop, backgrounding/shutdown, long/empty/silent input, partial/final updates, draft edits and keyboard operation. Test packaged desktop builds on each platform claimed as supported; E05 cloud/Indic voice does not pass this requirement.

## U11 — Images and PDFs

- [ ] Define canonical attachment/artifact records with stable IDs, original name, validated MIME/content signature, size, content digest, ownership and lifecycle. Use private storage and a narrow broker rather than arbitrary renderer filesystem access.
- [ ] Support file chooser and drag/drop, multiple files within explicit count/byte/page/resolution limits, previews, remove-before-send, upload/processing/cancel/retry and unsupported-model errors. Coordinate paste support as an explicit optional extension.
- [ ] Advertise image/PDF input support separately from text/tool support using provider/model capabilities and a verification path for unknown support. Never assume a provider family means every model accepts every modality.
- [ ] Send native image/PDF input only when supported. Coordinate PDF extraction with U02 for a disclosed text fallback; scanned/encrypted/corrupt/oversized PDFs need explicit outcomes. Never silently send only part of a document while implying complete coverage.
- [ ] Bound parsing/rendering resources and reject dangerous paths/active content. Do not execute attachment content or follow embedded instructions as authority. Keep previews and provider payloads within validated transport/size limits.
- [ ] Persist references for restart, retries, branches, pins and search. Define garbage collection for shared blob references and source deletion, and whether extracted text is searchable. No public-template export of private attachments.
- [ ] Explain provider routing before send, including derived text and images/pages. Model switching must revalidate all pending inputs; unsupported models cannot silently receive an incompatible payload or remote public URL.

**Acceptance.** Image and PDF success for capable models, unsupported/unknown capabilities, model change before send, mixed attachments, limits, cancellation/retry, corrupt/encrypted/scanned content, parser timeout, restart/branch reuse, deletion/garbage collection and routing checks. Include real supported-model evidence separately from fixtures, without uploading private files solely to manufacture a test.

## O01 — Per-bot cost, tokens and monthly cap

- [ ] Define an append-only or equivalently auditable usage ledger per actual provider call/attempt with bot, model/connection, task/parent, branch/routine/dream references, timestamps, request identity and outcome. Attribute each charge once, including nested/group/delegated calls and failed/retried/stream-interrupted calls.
- [ ] Record reported input/output/cache/reasoning tokens where available, with clear inclusive/exclusive definitions so totals do not double count provider fields. Distinguish reported, estimated, pending and unknown usage; missing is not zero. Track local-model tokens without inventing paid cost.
- [ ] Version pricing/currency/source/effective date at call time. Preserve historical estimates when rates change, account for cache/reasoning rates where supported, and separate provider-billed facts from estimates. Never claim to reconcile an invoice without evidence.
- [ ] Show per-bot/model/period breakdown, totals, biggest token/cost consumers and drill-down to calls/runs, with date/reset timezone, filters, retention/export and deletion/anonymization policy. Avoid attributing every group token to Socius as well as the specialist.
- [ ] Specify a user-configurable workspace monthly cap, with optional per-bot limits as an explicit extension; units may be tokens and/or a documented currency. Show current use, reserved/pending allowance, reset date/time and what work is blocked.
- [ ] Reserve bounded allowance atomically before dispatch and enforce it in every model entry path, including groups, retries, direct delegation, Dreaming, routines and diagnostic/test calls. Define diagnostic allowances explicitly rather than silently bypassing the cap.
- [ ] Require bounded output and an input/cost estimation policy. Under a monetary cap, unknown pricing or unbounded cost blocks dispatch unless the user supplies a supported conservative bound; an explicit bypass changes the guarantee and must be labelled. No model fallback to escape the cap.
- [ ] Reconcile reservations with actual usage, including cancellation, failure, missing usage, stalled requests and crash after provider completion. Do not release uncertain spend as zero; define conservative holds and manual reconciliation. Specify month-boundary/in-flight attribution, cap edits, timezone changes and concurrent-process ownership.
- [ ] The cap controls Socius-dispatched work, not unrelated calls made with the same provider account. External search/tool charges need their own metering/budgets or a clear separate category; do not conceal them inside token pricing.

**Acceptance.** Test exact accounting/no double count across all call paths, provider usage variants, price changes, retries/cancellation, concurrent reservations near the limit, unknown price/usage, crash recovery and month/timezone boundaries. Compare the displayed breakdown to ledger fixtures. Prove excess new dispatch is blocked in the runtime even when bypassing UI endpoints; document any remaining estimation limits before advertising a spending guarantee.

## O02 — Bot health

- [ ] Define and document a metric dictionary and observation window. Display reaction distribution, failed logical reply rate, attempt failure/retry rate where useful, use frequency and last use as separate inspectable signals before considering a composite score.
- [ ] Choose explicit denominators: reacted replies versus eligible replies, failed final replies versus attempted logical replies, and user sessions/messages/tasks for usage. Deduplicate retries and group/parent attribution appropriately; label background usage separately from user demand.
- [ ] Separate provider/auth/setup/network failures, user cancellation, approval waits, budget blocks and bot-quality failures where evidence supports that distinction. Do not infer “bad bot” from a provider outage or lack of reactions.
- [ ] Show counts, sample size, date range, trends and missing-data/low-confidence states. Reaction edits/removals, branch history, deleted replies/bots and time filters must produce consistent results. If a composite is added, publish weights/version and explain its limitations.
- [ ] Link evidence to exact replies/runs, with controls to open/edit a bot or initiate normal deletion confirmation. Recommendations aid the user; no automatic rewriting/deletion or hidden model/grant changes. Preserve the main-bot deletion rule.
- [ ] Keep health local/private, respect retention/deletion, and distinguish product diagnostics from opt-in analytics upload. Cost/usage O01 may supply context but token count alone is not quality.

**Acceptance.** Fixture tests cover all reaction values, no/small samples, changed/removed reactions, retries, cancellations, provider outages, mixed direct/group/background work, time windows and deleted sources. Verify every summary against underlying counts and source navigation; rewrite/delete remains an explicit user decision.

## Integration sequence and release evidence

1. Agree identities/revisions/source provenance and shared execution, approval, usage and budget hooks. Record decisions and migrations before concurrent feature implementation.
2. Implement A07 as the priority orchestrator flow; coordinate A04 and O01 so new calls already have durable ownership and metering hooks. Continue A03/A04/A05 in Issue #10 rather than duplicating it.
3. Deliver A08 and U11 through reviewed provider/input boundaries. Add U07/U08/U09 against the shared history/source model; do not ship branch behavior that silently breaks search, pins, approvals or memory provenance.
4. Deliver U10 after platform/local-processing evidence; deliver O01/O02 views with documented metrics and verified runtime enforcement. UI ordering remains the user's decision.
5. Integrate coherent feature PRs with focused tests, API examples, migration/recovery notes and relevant browser/desktop evidence. Run `npm run check`, `npm run catalog:check`, `npm run build` and relevant `npm run test:e2e` workflows as required by the touched code. Documentation-only specification changes do not constitute feature-test evidence.

For every package, cover valid use, denied/unsupported/setup states, invalid input, duplicate/concurrent request, cancellation, revocation/edit/delete races, provider/network failure, restart/recovery and lifecycle cleanup where applicable. Record known unsupported platforms/providers explicitly. Live tests require configured access and the user's data-routing authorization; fixture success remains labelled.

## Definition of done and scope control

A feature is complete only when its requirements and acceptance matrix pass, public/private boundaries remain intact, migrations and failure/recovery behavior are documented, UI integration is reviewed with its owner, and reviewed code is deliberately integrated. Update README, API/architecture docs, team handoff and Notion at that point. Keep all feature boxes unchecked while only this spec is merged.

This PR/spec does not implement features, choose external vendors without evaluation, install services, assign people or dates, authorize private-data uploads, restore boards, deliver semantic memory, create cloud workers or broaden external-message permission. Open implementation questions must be resolved in the owning feature's design/PR rather than silently omitted or called complete.
