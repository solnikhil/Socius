# Dreaming: background memory consolidation

Status: specification, 14 October 2026. Implementation and verification are tracked below. This is a Socius design; it makes no claim to reproduce ChatGPT's internal implementation.

## Outcome

Replace approval-driven fact collection as the normal memory workflow with an optional, bounded background dreamer. After conversations settle, the user's chosen model identifies durable preferences, facts and ongoing work, combines duplicates and revises earlier dream memories. Bots recall these memories in later chats. Existing Markdown notes, their editor and FTS5 remain the storage and retrieval foundation.

The user chooses a dedicated provider/model in Settings → Dreaming. Enabling dreaming explicitly authorizes automatic private memory updates and sending eligible direct-chat history plus that bot's current memories to this provider. It never authorizes tools, connectors, messages, bot creation, permission changes or public template publication. Default is off, with no model selected and no fallback to a chat model.

## Main working parts

1. **Configuration and consent.** Persist enabled, exact model reference, idle delay and minimum interval. Explain destination and scope before enablement. Enablement includes existing completed direct-chat history. Selection does not itself enable dreaming. Missing/removed model pauses processing visibly; it never silently switches providers.
2. **Idle scheduler.** The local runtime polls every 30 seconds, starts only after five minutes without foreground work, and runs one bot at a time. At most one run per bot per hour, including failures. A foreground task interrupts dreaming; pending sources remain available. Host sleep suspends work; reopening the runtime catches up incrementally without a burst of concurrent calls. No OS wake or cloud scheduler is implied.
3. **Eligible sources.** Only user messages from completed direct-chat tasks belonging to that bot. Assistant responses are not factual evidence. Failed/cancelled/in-flight tasks, attachments embedded in messages, group conversations, retired boards and connected-app content are excluded. Group consolidation needs a separate sharing decision and is deferred. The batch contains at most 24 messages, each at most 4,000 characters, and at most 32,000 source characters. Oversized messages and document-bearing turns are marked skipped rather than silently treating excerpts as complete evidence.
4. **Synthesis.** One tool-free AI SDK structured generation call with a two-minute deadline, no SDK retries, at most 3,000 output tokens and at most eight changes. Each change has optional target memory ID, concise content and at least one source message ID. At least one cited source must be from the new batch; all other citations must come from the target's existing provenance. Empty changes are valid. Include up to 80 existing memories/40,000 characters; omitted records cannot be updated.
5. **Validation and policy.** Strictly validate output; enforce citations, bot ownership, current grants, setting revision, unchanged sources and memory baseline before writing. Only existing dream-owned notes can be updated. User notes and manually corrected notes are protected. Deduplicate normalized content against all existing notes. Cap dream-owned notes at 200 per bot; updates remain possible. Model output is untrusted data and has no execution path. Semantic truth and sensitivity still depend on the model; structural checks cannot guarantee perfect extraction.
6. **Durable commit and recovery.** Store a run journal before touching Markdown. Assign stable UUIDs to additions. Atomically replace each file, then advance processed-source records and complete the journal. On restart, interrupted model calls become failed and are not replayed automatically before the interval elapses. An interrupted commit may finish only if settings, grants, sources and baseline still match (allowing already-applied journal writes). Deterministic IDs avoid duplicate notes. Conflicting external edits invalidate the journal; already-applied file changes remain visible and the run reports interruption honestly.
7. **Recall and controls.** Supply a bounded set of relevant private memories as untrusted context even to text-only models; retain search for tool-capable models. While dreaming is enabled, chat bots do not propose new approval-driven memories. Existing pending approvals remain reviewable, and the manual editor remains available. Show recent runs, errors, counts, model and source evidence. Allow Dream now (still checks grants, consent, model, foreground work and budgets) and cancellation.
8. **Correction and forgetting.** Manual edits become user-owned and cannot be overwritten by dreaming. Deletion records source-message suppression before removing the file, so old evidence is not re-learned on retries or later runs. This prevents replay from those messages, not re-expression by a future user message. Revoking memory access or disabling dreaming cancels active processing and invalidates pending commits. No memory or transcript is exported into templates.

## Persisted records and API

Keep schema changes additive through existing typed records. Add dreaming settings, runs/journals, processed sources and per-bot suppressed source IDs. Memory metadata gains optional dream provenance: run ID and source message IDs. Old files load unchanged. Provenance IDs are local references, never credentials or copied transcripts.

- `GET /api/dreaming`: settings, recent runs and whether the selected model is available.
- `POST /api/dreaming/settings`: validate and replace settings, increment revision and cancel active work.
- `POST /api/dreaming/run {botId}`: start one eligible run; return the durable run immediately, do not hold an HTTP request for inference.
- `POST /api/dreaming/cancel {id}`: abort a running generation before commit.
- Existing paired-session/origin checks protect every endpoint.
- State snapshot includes dreaming status for Settings. Provider mutation guards include active dream calls. Shutdown awaits cancellation before closing SQLite.

## Acceptance criteria

- Existing memories survive migration/restart unchanged; default configuration makes no model calls.
- Dedicated dreaming selection is independent of chat models; provider/model removal never routes data elsewhere.
- A completed user conversation produces cited private memories in the background and later chat recall includes them, including for a text-only model.
- Duplicate facts consolidate; unsupported citations and cross-bot targets fail closed; user notes remain protected.
- No foreground latency blocking, overlapping runs, unbounded batches, tool access or catch-up bursts.
- Cancellation, consent/grant revocation, source changes and manual edits during inference prevent stale writes.
- Corrected/deleted facts are protected; suppression survives restart.
- Journal interruption recovers without duplicate writes and external conflicts are visible.
- Settings supports enable/disable, provider destination, independent model selection, run history, manual run and stop.
- Full typecheck/tests, catalog check, build and browser verification pass. Live model extraction quality is recorded separately from fixtures.

## Implementation status

- [ ] Settings/contracts and model resolution.
- [ ] Idle scheduler, bounded synthesis and runtime policy.
- [ ] Durable journals, provenance, correction/deletion protection.
- [ ] Recall and focused Settings integration.
- [ ] Automated acceptance and Notion synchronization.
- [ ] Live dreaming extraction quality evaluation (requires an explicitly enabled provider).

## Deferred

Semantic embeddings/vector search, group/shared memory, arbitrary file or connector ingestion, cloud wakeups, proactive outward actions, automatic sensitive-data classification, fine-tuning and general routine scheduling. Dreaming does not complete those roadmap items.
