# Working instructions

Build durable foundations. Avoid throwaway prototypes and patches that bypass the architecture.

- Read `docs/architecture/v1.md` and the relevant work package in `docs/team-handoff.md` before implementing.
- Keep published templates separate from private bot instances, user memory and credentials.
- Treat manifest capabilities as requests. Runtime enforcement is mandatory and cannot rely on prompts.
- Do not execute package code during catalog parsing, previews or dependency resolution.
- Run `npm run check` and `npm run catalog:check` for changes to contracts or marketplace logic.
- Record implemented versus planned behavior honestly in documentation.
- User-authorized integration workflow: commit verified, coherent work and push to `main` after each completed work unit. Do not force-push or overwrite unrelated work. Teammate feature work uses `codex/<topic>` branches and PRs; integrate completed PRs deliberately.
