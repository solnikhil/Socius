# Browser preview and window presentation

Implemented a local masked page preview in a right-hand chat column, collapse/expand, a compact stacked layout on narrow screens, and native minimize/restore. The browser starts minimized; Open browser and Take control restore it; Resume minimizes it. Stop and Take control remain available while the resumed conversation continues, including when it waits for approval. Window-manager support remains platform-dependent. The existing session ownership, exact-action approvals and network policy remain in effect.

Preview images are transient responses to the authenticated local UI, never persisted or sent to a model. Capture masks inputs, textareas, selects, editable regions and embedded frames. It shares the command queue and discards results after ownership, grant, tab or URL changes. Human control suspends capture. The frontend stops polling when collapsed, unmounted or hidden and rejects stale responses.

Validation on macOS:

- Typecheck, catalog check and production build passed.
- `npm run check` ran typecheck and tests but retained open test-worker handles, as in the preceding validation unit; it was stopped. The same complete test set passed with `--test-force-exit --test-timeout=60000`: 239 passed, zero failures/cancellations/skips. No normal-runner exit success is claimed.
- The new real-Chromium privacy test decodes the JPEG and checks masked pixels for all five field/frame categories, checks authenticated/no-store responses, confirms no image enters workspace snapshots, and verifies takeover pause, resume and revoked-grant refusal.
- The eight existing end-to-end flows passed. The new browser-preview end-to-end test passed separately after its immediate native-state assertions were changed to wait for asynchronous UI actions. It verifies actual minimized/normal window states, restores on takeover, minimizes on resume, collapse/expand, preview rendering, desktop non-overlap and no horizontal overflow at 390px. Desktop and narrow-screen screenshots were visually inspected.
- React review covered effect cleanup, aborts and stale responses, stable session keys, local frame state, semantic controls and responsive layout.

These are controlled fixtures. No live provider/browser research, real human sign-in, packaged build, Windows or Linux acceptance is claimed. Masking is not a general secret detector for arbitrary page text.
