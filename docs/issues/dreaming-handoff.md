# Dreaming implementation status

Tracking: [Issue #8](https://github.com/solnikhil/Socius/issues/8). [Handwritten specification](../specs/dreaming.md). Behaviour: [Dreaming](../architecture/dreaming.md). Evidence: [validation record](../validation/2026-10-14-dreaming.md).

Dreaming is implemented on `codex/dreaming-foundation` in [PR #9](https://github.com/solnikhil/Socius/pull/9). It is not on main until that PR is reviewed and merged. Close the issue only after integration.

## Implemented since the draft

- **Journal recovery.** If SQLite finalization fails, the journal is kept and the run shows a `storage` error until restart reconciles it. Recovery accepts writes that were already applied and treats edited partial writes as conflicts.
- **Interrupted deletion.** Memory deletion and bot deletion are journalled (`memory-delete`, `bot-delete`), with no filesystem mutation inside a rollback-able transaction. Both resume at start.
- **Retention.** The 30 most recent finished runs per bot are kept. Processed and suppressed source records last as long as their source message, and all ledgers are removed with the bot.
- **Current-request recall.** Direct chat, the group coordinator and group members each search with their own current request.
- **Cancellation and timeouts.** Credential decryption and the model call both abort on Stop, foreground work, settings changes, shutdown or the two-minute deadline. A stalled transport does not block shutdown.
- **Settings revisions.** Saves carry `expectedRevision`. A stale pane gets 409 and an inline warning, and polling errors are shown.
- **Readable evidence.** `GET /api/dreaming/sources` and a "Source messages" disclosure in Settings and Memory show the original messages.
- **Structured output.** The schema is stated in the prompt, for adapters that send only JSON mode. Validation stays strict.
- **Classified errors.** Failures are recorded as `invalid_output`, `state_changed`, `storage` or a provider error code.
- **Tests.** A deterministic E2E `dreamRunner`, a browser acceptance workflow, and an opt-in live check (`npm run test:live:dreaming`) in an isolated profile.

## Open

- **UI review.** The UI owner should review the Dreaming pane's visuals. The consent checkbox renders above its label, and the bot picker resets when the tab changes.
- **Secrets.** In live runs, `openrouter/free` saved a synthetic one-time code in 2 of 6 dreams. A deterministic runtime credential guard should be agreed and added. Broader sensitive-data classification remains deferred by the spec.
- **Production model.** Repeat live acceptance with the chosen production dreaming model, and through an OpenAI-compatible or local server, before release.
- **Notion.** Synchronize the Notion memory section and dreaming checklist after integration, ticking only verified work on main.

## Ownership

Shared contracts, runtime, store and model hooks were changed additively and coordinated through this PR. UI and visual refinement remain the user's. Never force-push or overwrite concurrent work. Board records remain historical, and no board execution or UI returns.
