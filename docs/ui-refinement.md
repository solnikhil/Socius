# User-owned UI and refinement checklist

Owner: **You**. These tasks are separate from teammates' backend implementation. Current published UI has New Chat, Connect Apps, chat, memory and settings, light/dark themes, and inline approval review. The dedicated Activity tab was removed in commit 01347b7; keep activity recording without reintroducing the tab by assumption.

## Work you can start now

- [ ] Refine layout, spacing, typography, light/dark colors, avatars and navigation consistency.
- [ ] Polish the chat composer, streamed replies, code/Markdown presentation, copy/export and attachment states.
- [ ] Refine New Chat and custom-bot creation/editing; clarify the main bot versus specialists.
- [ ] Refine Connect Apps search, skill/connector/bot categories, detail views and install/setup states.
- [ ] Review Luna's uncommitted OpenRouter hint in SettingsView.tsx; keep or adjust it as your UI change.
- [ ] Polish model settings, connect/setup errors, waiting states and inline approvals.
- [ ] Check keyboard navigation, contrast, focus, responsive behavior and empty/loading/error states.

Use existing endpoints for live behavior. Backend-specific screens can use clearly labelled development fixtures while their APIs are being built; no simulated successes in production.

## Coordinate before wiring new backend flows

- [ ] Agree board, roster, task, contribution and result DTOs/events with the Teams & Boards teammate.
- [ ] Build board switcher, team roster, shared chat and task/result views; no hardcoded bot-count cap.
- [ ] Agree install/enable/update/uninstall and connector authentication states with the Marketplace teammate.
- [ ] Connect the new screens to their APIs and validate the two GitHub issue workflows jointly.

## Handoff rules

You own `apps/web/src` and visual/presentation changes in `apps/desktop`. Teammates provide services, payload examples, error states and acceptance evidence. Agree any shared-file edit before starting it. Runtime/desktop lifecycle security work is coordinated separately from visual design.

Before completing a UI unit: check type errors, build the UI, test the relevant interaction and record a screenshot or short clip. Keep unrelated backend draft changes out of your commit unless reviewed and intentionally integrated.
