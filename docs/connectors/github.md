# GitHub connector

Draft implementation, stacked on the Linear foundation. Search issues, read a single issue, and propose creation of an issue. Pull requests, code pushes, assignments, issue updates and administrative actions are outside this first release.

Uses the official remote MCP endpoint `https://api.githubcopilot.com/mcp/`. Register a dedicated OAuth app with callback `http://127.0.0.1:37377/oauth/callback` and configure `SOCIUS_GITHUB_CLIENT_ID` / `SOCIUS_GITHUB_CLIENT_SECRET` on the runtime host. Never embed the secret in a distributed desktop build. Discovery follows the provider's protected-resource metadata; dynamic registration is unsupported. Organization approval and SSO policy can restrict access. Initial OAuth scope is `repo`, which is broad; review this consent explicitly. A fine-grained GitHub App flow is future work and must not be claimed here.

The reviewed adapter fixes `issue_read.method=get` and `issue_write.method=create`; the model cannot request updates, labels or assignments through these actions. Each bot needs an explicit GitHub grant. All writes require the existing exact-content approval broker. Results marked as errors (including an upstream interactive form handoff) cannot be reported as successful creation. An ambiguous response remains unknown and is not automatically replayed.

Automated tests check manifest parity, fixed methods, rejected update fields and unsuccessful upstream responses. Inherited runtime tests cover OAuth, scoped permissions and approval enforcement. Before merge: verify registered-client OAuth, refresh/restart/revocation, organization restrictions, current tool schemas and create/read/search in a disposable repository. Confirm whether the upstream issue tool requires an MCP App form; this client does not render such forms. If required, keep creation disabled/unsupported until a reviewed noninteractive path is implemented. No live account acceptance is claimed.

Sources: [host integration and OAuth](https://github.com/github/github-mcp-server/blob/main/docs/host-integration.md), [reviewed issue tools](https://github.com/github/github-mcp-server/blob/main/pkg/github/issues.go).
