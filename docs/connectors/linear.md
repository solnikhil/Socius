# Linear connector

Draft implementation; not live-account verified. This is the first PR in the connector batch and includes the shared runtime foundation. Existing Notion behavior remains compatible.

## Contract

The fixed endpoint is `https://mcp.linear.app/mcp`. OAuth requests `read write`. Reviewed actions search issues (`list_issues`), fetch an issue (`get_issue`) and propose a new issue (`save_issue`). Creation accepts only team, title and description; an existing issue ID cannot be supplied. Search is bounded to 50 items and returned remote text is capped at 12,000 characters. Additional tools are never exposed automatically.

A bot needs installation consent, its capability grant, an explicit grant for this connector, and a ready authenticated connection. The broker rechecks all of these at execution time. Every write binds approval to exact normalized arguments, connection and release digest. A lost response leaves an unknown outcome; users must inspect Linear before making a new request. No automatic write replay or reconciliation is claimed.

Credentials use the existing OS-backed encrypted storage. Sign-in uses PKCE and a one-use state with a ten-minute lifetime. A new sign-in invalidates older pending flows for that connection. Disconnect deletes local credentials, attempts provider revocation and clears connector-specific bot grants. Provider revocation can require manual removal in Linear settings.

## Shared foundation

`POST /api/connectors/grants` accepts botId, connectorId, capability and granted. It permits only the connector's reviewed capabilities and requires an enabled, consented installation for new grants. Snapshot includes connectorGrants. Other connectors cannot borrow a global documents/messages/calendar grant. The existing Notion grant path is retained for compatibility.

Registered OAuth clients can use a fixed loopback callback, `http://127.0.0.1:37377/oauth/callback`, with host/path/method validation. Host configuration names belong in each provider's own PR; no application secret is embedded in the catalog or browser. Client secrets on a user's own desktop are not confidential from that machine's owner. Product-wide distributed OAuth registration/consent remains a release decision, not a bundled shared secret.

## Verification and acceptance

Automated fixture coverage exercises real OAuth/PKCE and Streamable HTTP MCP requests, denial without the connector grant, reads, no side effect before approval, permission revocation before approval, exact approved write arguments, one-use callback and disconnect cleanup. Existing broker tests cover crash/ambiguous outcomes and approval tampering.

Before marking ready: connect a disposable Linear workspace; compare live tools/list schemas; verify search and fetch; deny a create, approve one create and inspect it in Linear; revoke provider access and reconnect; verify encrypted storage and restart in Electron. Confirm scoped grants in the existing package detail screen. No live credentials were used during development.

Sources: [Linear MCP](https://linear.app/docs/mcp), [current Linear tool names](https://linear.app/integrations/slack).
