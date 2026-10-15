# Bot creation review flow

The reported conversation described a bot proposal in prose and asked for a thumbs-up before opening the real review. A message reaction cannot create a proposal or approve one. The screenshot alone does not establish whether the selected model had tool calling enabled.

Socius 0.6.1 explicitly calls for opening `createBot` on a clear creation request, without preliminary confirmation. Draft-only requests stay in text. The adapter reinforces the actual review flow when the tool is present and supplies an honest manual-creation fallback when absent. The runtime approval boundary is unchanged; no bot is created from prose or reactions.

Validation:

- Typecheck passed during `npm run check`.
- The ordinary full check did not exit after tests; it was stopped. No ordinary-check success is claimed.
- The same complete test set passed with Node's `--test-force-exit --test-timeout=60000`: 238 passed, zero failures, cancellations or skips. The normal runner's remaining handles were not diagnosed or fixed in this unit.
- `npm run catalog:check` and `npm run build` passed.
- `npm run test:e2e`: all 8 passed, including reviewed bot creation and desktop restart persistence.
- Adapter fixtures cover instruction delivery, the actual tool callback and result, and fallback when either model tool support or the proposal callback is absent. Runtime fixtures cover single creation after approval, instruction refresh and persisted reaction feedback.

These are deterministic fixtures. No live-model retry of Clarity was performed. Instruction changes reduce the demonstrated failure mode but cannot guarantee that every provider/model will call the tool.
