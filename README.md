# Socius

A local-first personal agent platform with a bundled main bot and two marketplace sections: **Skills & Connectors** and **Bots**.

This repository currently contains the marketplace domain foundation and team handoff. It does not yet run an AI agent, expose a server, install executable packages, or ship a user interface.

## Run the foundation checks

Use Node.js 24 and npm.

```sh
npm ci
npm run check
npm run catalog:check
```

The catalog command validates the bundled main bot, prepares its installation plan, and creates a fresh in-memory instance. It invokes no model and grants no permissions.

## Where to start

- [Grok Bot research](docs/research/grok-bot.md): official product behavior, installed-app observations, uncertainties, and implications.
- [V1 architecture](docs/architecture/v1.md): boundaries and marketplace lifecycle.
- [Updated stack implementation sequence](docs/architecture/implementation-sequence.md): how the new Notion choices fit into verifiable delivery.
- [Team handoff](docs/team-handoff.md): independent work packages and acceptance criteria.
- `packages/contracts`: strict manifest schemas and shared domain types.
- `packages/marketplace`: validated catalog, dependency planning, and bundled Socius bot template.

The workspace packages are private TypeScript source packages. Public SDK distribution requires a compiled export surface, compatibility policy, and license decision.
