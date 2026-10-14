# Dreaming

Dreaming is opt-in background memory consolidation. While Socius is open and idle, a dedicated model reads a bot's completed direct-chat user messages and saves durable facts to that bot's private memory. It implements [Issue #8](https://github.com/solnikhil/Socius/issues/8) against the [handwritten specification](../specs/dreaming.md). Service: `packages/runtime/src/dreaming.ts`. Evidence: [validation record](../validation/2026-10-14-dreaming.md).

## Settings and consent

- Stored as one `dream-settings` record: `enabled`, an exact `{connectionId, modelId}` model reference, `idleMinutes` (1–60, default 5), `intervalMinutes` per bot (15–1440, default 60) and a `revision`.
- Default off with no model. Choosing a model does not enable dreaming, and enabling without a model is rejected. There is no fallback to the chat default or another provider.
- Every save sends `expectedRevision`. A stale Settings pane gets 409 and must reopen. Each saved revision cancels any running dream.
- Settings → Dreaming discloses where excerpts go: this computer, a configured endpoint (local only if hosted locally), or a cloud provider that may charge. Enabling covers existing direct-chat history.
- A removed or unavailable model pauses dreaming visibly ("The saved dreaming model is unavailable"). Dream now is then disabled. Provider and model mutations are refused while a dream is using that connection, and shutdown cancels and awaits the active dream before SQLite closes.

## Scheduling

- A 30-second local timer starts one dream at a time once the app has been idle for `idleMinutes` and the bot's last dream (including a failure) is older than `intervalMinutes`. Catch-up after restart is incremental through processed-source records. Host sleep pauses the timer. There are no OS wakeups or closed-app runs.
- Foreground chat takes priority: starting a chat or group task aborts the running dream (recorded as `cancelled`), and Dream now refuses while foreground work runs.
- Dream now runs immediately for a chosen bot. Stop cancels the running dream. Neither bypasses consent, the model check or memory grants.

## Evidence and synthesis

- Evidence is only user messages from that bot's completed direct-chat tasks. Group chats, failed, cancelled or in-flight tasks, assistant replies, connector content and retired boards are excluded.
- Each batch takes up to 24 messages and 32,000 characters. A message over 4,000 characters or containing an attached document is marked processed without being sent, and counted as `skipped` ("excluded" in Settings).
- The model call is tool-free AI SDK structured generation (`Output.object`), with at most 8 changes, 3,000 output tokens, no SDK retries and a two-minute deadline.
- The JSON Schema is also stated in the instructions. OpenAI-compatible adapters, including Ollama, LM Studio and llama.cpp, send JSON mode (`json_object`) and drop the schema, so the model still sees the required shape. Native and fallback output are validated by the same strict Zod schema.
- Context includes up to 80 of the bot's current notes, limited to 40,000 serialized characters. Notes left out cannot be updated.
- Sources and notes are framed as untrusted data. Prompt instructions are guidance only; the rules below are enforced by the runtime.

## Runtime enforcement

- Output is rejected as a whole (`invalid_output`, nothing saved) when a change updates a missing note, a note outside the context, or one not owned by Dreaming. The same applies when a change cites no new source, cites an ID outside the new batch or the target's own provenance, or updates the same note twice.
- Exact duplicate content (after normalization) is skipped. New dream-owned notes are capped at 200 per bot, while consolidation updates remain allowed.
- Memory read and write grants, the settings revision and consent, the model's availability and the source digests are checked before journalling and again at commit. A manual edit or deletion of any baseline note made during inference also blocks the commit. Any change makes the run `stale` and nothing is written.
- There are no tools, connectors, outgoing messages, bot creation, package execution or capability changes. Persisted run errors are classified messages; raw provider bodies are not stored.

## Memory lifecycle

- Dreamed notes have `source: "Dreaming"` and additive provenance `{runId, sourceMessageIds}`. Each note keeps at most 48 source IDs: the last 24 inherited plus the new citations. Older memory files load unchanged.
- Validated writes are journalled in the run record (`committing`) before any Markdown file changes. Files use stable IDs and atomic replacement.
- On restart, a `committing` run is revalidated and resumed, accepting writes that were already applied. A conflict marks it `stale` and leaves partial writes visible. A run that was `running` is marked `failed` without replaying the model call.
- If SQLite finalization fails, the journal is kept, the run shows a `storage` error, and new dreams are refused until a restart reconciles it.
- **Correction:** editing a dreamed note in Memory makes it `User editor`-owned, so Dreaming can no longer rewrite it, but it keeps its provenance for later forgetting.
- **Forgetting:** deleting a note first commits a `memory-delete` journal and suppresses its source messages, then removes the file and index entry. Restart finishes an interrupted deletion. Suppressed sources are never used again, though a new statement in a later chat can reintroduce the fact.
- **Bot deletion** is journalled (`bot-delete`). It cancels the bot's dream and removes its memories, messages, runs and dreaming ledgers, and it resumes after a crash. Board history is untouched.

## Retention

| Record                         | Kept until                                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Run history (`dream-run`)      | The 30 most recent finished runs per bot. Running or committing runs are never pruned. All are removed with the bot. |
| Processed / suppressed sources | Their source message or bot is deleted. While the message exists they prevent replay and relearning.                 |
| Last-run time (`dream-last`)   | The bot is deleted.                                                                                                  |
| Interrupted journals           | Reconciled at the next start (committed, or marked stale or failed). Deletion journals are finished at start.        |

Pruning runs at start and after each committed dream.

## Recall in chat

- When a bot has `memory.read`, the runtime searches that bot's memory with the **current request**. Direct chat uses the user's message, the group coordinator uses the user's message, and a group member uses the coordinator's question. Up to 8 FTS5 matches are passed as an untrusted data message, which also works for text-only models. Where tools exist, scoped memory search remains available.
- While dreaming is enabled, the approval-driven new-memory proposal tool is removed from bots. Existing pending approvals and manual editing keep working. With dreaming off, memory, grants and approvals behave as before.

## Inspecting evidence

`GET /api/dreaming/sources?botId=&runId=|memoryId=` returns the cited messages for one run or one note, scoped to that bot's direct user messages and clipped to 4,000 characters. A deleted message comes back as unavailable. Settings → Recent dreams and Memory both offer a "Source messages" disclosure that shows the original text and time instead of opaque IDs.

## Known limitations

- **Secrets:** in live runs on `openrouter/free`, a synthetic one-time code was saved in 2 of 6 dreams despite the instructions. Automatic sensitive-data classification is deferred by the spec, so nothing in the runtime blocks a credential-like note today. Users can delete such a note, which also suppresses its source. A deterministic credential guard is the recommended follow-up.
- **Quality:** extraction depends on the model. Live runs also saved temporary context once ("running a synthetic acceptance test"). Use a capable dreaming model.
- **Search:** recall uses FTS5 keyword match, not semantic search. A question that shares no words with a note will not recall it.
- **Scope:** dreaming covers direct chats only, with no group or shared memory, no embeddings, no file or connector ingestion and no cloud wakeups.
