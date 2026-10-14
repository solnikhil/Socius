# Slack connector

Draft implementation, stacked after Calendar. Public-channel message search and individually approved top-level posts to existing channel IDs. Posts act as the connected user and may notify channel members or mentioned people. Initial scope excludes private search, DMs, thread/history reading, scheduling, canvas/files, channel creation and message editing/deletion.

Register an internal or Slack Marketplace-published app; unlisted apps cannot use Slack MCP. Configure `SOCIUS_SLACK_CLIENT_ID` and `SOCIUS_SLACK_CLIENT_SECRET` on the runtime host, with exact redirect `http://127.0.0.1:37377/oauth/callback`. Configure user scopes search:read.public and chat:write. Workspace admin approval and IP allowlists may block connection; Slack Connect restrictions may block posting. A distributed release needs an app registration/secret-distribution design; do not bundle a shared confidential secret.

Endpoint: `https://mcp.slack.com/mcp`; allowlist: slack_search_public and slack_send_message. Uses confidential OAuth/PKCE via provider metadata, not dynamic registration. A Gmail messages grant cannot grant Slack access: both installation consent and a connector-specific bot grant are required. Exact channel ID and Markdown text are bound to approval; names are not guessed or resolved implicitly. DM IDs, reply broadcasts, scheduling and arbitrary upstream parameters are rejected. The first search page is capped at twenty, outgoing text at 4,000 characters and returned text at 12,000. Unknown posting outcomes require checking Slack before a new proposal; no automatic send retry.

Tests validate manifest/action parity, target validation, preserved paragraphs and blocked alternate send fields. Shared tests cover client-secret OAuth, refresh/revocation and grant checks at approval execution.

Before merge: validate the current tools/list schemas in an eligible workspace, inspect public search boundaries, deny and approve a post to a disposable channel, inspect author/channel/body in Slack, test mentions/Markdown rendering, workspace and Slack Connect restrictions, rate limiting, restart/refresh and provider/local revocation. No real messages were sent during development. Do not mark live verification complete based on fixtures.

Sources: [Slack MCP auth/scopes/policies](https://docs.slack.dev/ai/slack-mcp-server/), [official search guidance](https://github.com/slackapi/slack-skills-plugin/blob/main/skills/slack-search/SKILL.md), [official message guidance](https://github.com/slackapi/slack-skills-plugin/blob/main/skills/slack-messaging/SKILL.md).
