# Dreaming implementation handoff

Tracking: [Issue #8](https://github.com/solnikhil/Socius/issues/8). Owner: unassigned; the user will assign it. [Handwritten specification](../specs/dreaming.md).

The specification is integrated on main. The implementation on `codex/dreaming-foundation` is a **partial draft**, deliberately not merged. Do not describe dreaming as delivered or close the issue on the strength of this branch.

## Draft inventory

- `packages/runtime/src/dreaming.ts`: settings validation, bounded tool-free AI SDK structured synthesis, single-flight idle scheduler, source selection/processing ledger, strict ownership/citation checks, write journals, restart reconciliation and cancellation.
- `packages/contracts/src/app.ts`: dreaming settings/status/run DTOs and optional memory provenance; `Snapshot.dreaming` is additive but required for typed consumers.
- `packages/runtime/src/store.ts`: provenance in Markdown metadata, suppression before deletion, old file compatibility.
- `packages/runtime/src/providers/service.ts`: exact-model resolution without a chat fallback.
- `packages/runtime/src/server.ts`: paired API endpoints, foreground interruption, provider mutation guard, shutdown, correction/grant hooks and bounded recall.
- `packages/runtime/src/model.ts`: recalled private data context for text-only models and removal of the new-memory proposal tool while dreaming is enabled.
- `apps/web/src/views/settings/DreamingPane.tsx` and focused existing Settings/Memory changes: consent, separate model choice, status polling, run/stop/history and destination disclosure. These use the existing layout and need owner review.

## Evidence so far

- `npm run check`: typecheck and all 114 existing tests pass on the draft.
- `npm run catalog:check` and `npm run build`: passed on the draft.
- Both existing workspace browser workflows also pass on the draft. The Electron launch workflow failed before dreaming changes with `Process failed to launch` / `kill EPERM`. That failure is not a completed desktop check or a demonstrated dreaming regression.
- No dedicated dreamer tests, crash-injection tests or live dreaming evaluation were completed. Existing-suite success is regression evidence only.

## Review and completion priorities

1. Add dedicated tests for each acceptance criterion in the issue before merging. Use the injected `dreamRunner` boundary and isolated data directories; do not call the user's live providers implicitly.
2. Review journal handling across every crash/write/checkpoint boundary, including partial I/O failure and external file changes. Finish must never discard the only recoverable journal if the database commit fails. Ensure suppression cannot roll back independently of a deleted file during bot-deletion transactions.
3. Define retention/cleanup for processed/suppressed sources, historical runs, deleted bots and abandoned journals. The draft retains records indefinitely.
4. Review recall against the actual current direct/group request. The draft chooses a query from the bot's last direct user message; group recall needs the current request while preserving private bot scope. Verify text-only providers accept the data-message framing.
5. Bound all serialized metadata and provenance, not only note text. The draft retains a 48-source provenance horizon while processed-source records prevent old input replay; review this as an explicit product choice.
6. Verify provider changes, settings changes, foreground start, bot deletion and grant revoke/re-enable races. Keep exact provider selection and cancellation semantics; do not introduce fallback routing.
7. Validate the consent/settings experience with the UI owner. Make source inspection useful beyond opaque IDs, surface polling/configuration errors, and test stale settings/model-removal states and keyboard behavior.
8. Add classified but redacted failure reporting, meaningful skipped/capacity counts, and a scheduler test seam for deterministic idle/cooldown tests. Test timeout/shutdown with stalled transports.
9. Run the full automated suite, resolve or document the Electron environment issue, then record an explicitly consented live extraction → recall → correction → forgetting flow.
10. Update architecture/API/README/team handoff and the Notion tracker to describe only final implemented/integrated behavior. General scheduling, group/shared memory, semantic search and cloud wakeups remain deferred.

## Ownership and integration

Coordinate shared contracts/runtime/store/model hooks with existing workstreams. UI/visual refinement remains the user's responsibility; the issue authorizes focused integration, not an independent redesign. Keep the feature in a `codex/<topic>` branch and a PR, and integrate deliberately after acceptance evidence. Never force-push or overwrite concurrent work. Existing board records remain historical and no board execution/UI returns.
