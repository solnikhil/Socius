# Gmail connector

Draft implementation, stacked on GitHub/Linear. Searches threads, reads one thread and creates a plain-text draft after exact-content approval. It cannot send email, change labels, delete, forward or attach files. Draft creation is still a remote write and requires the `messages.send` runtime grant; the setup and action wording explicitly distinguish drafting from sending.

Enroll in the Google Workspace MCP Developer Preview and enable Gmail plus Gmail MCP APIs for the Cloud project. Configure a Web application OAuth client marked as an AI agent; add the exact redirect `http://127.0.0.1:37377/oauth/callback`. Set `SOCIUS_GMAIL_CLIENT_ID` and `SOCIUS_GMAIL_CLIENT_SECRET` on the runtime host. The app requests gmail.readonly and gmail.compose, with offline access and explicit consent for refresh-token issuance. Scope consent can require Google verification/admin approval. No secret is embedded in catalog data or a distributed client. Gmail, Calendar and Drive use separate connections and bot grants.

The fixed endpoint is `https://gmailmcp.googleapis.com/mcp/v1`. Tool allowlist: search_threads, get_thread and create_draft. Search returns at most 50 threads per request; remote text is capped. Recipients are plain validated email addresses, bounded to twenty; subject rejects newlines. Raw MIME, HTML, arbitrary headers, CC/BCC and attachments are not accepted by this first action. All messages are untrusted content, never permission instructions. Unknown write outcomes must be checked in Gmail Drafts before a new request; no automatic replay.

Tests exercise manifest parity, recipient/header injection rejection and exact draft mapping. The shared registered-client OAuth fixture verifies client authentication, callback/state protection, scoped consent and credential refresh; the shared broker test covers grant revocation before approval.

Before merge: configure an eligible preview account; verify live tools/list, Google consent and refresh after restart, create/deny one disposable draft, inspect exact content in Gmail and verify no message was sent, revoke provider access and local grants. Preview availability and desktop OS credential-storage verification are release gates. No live Gmail acceptance is claimed.

Sources: [Google MCP setup](https://developers.google.com/workspace/guides/configure-mcp-servers), [draft schema](https://developers.google.com/workspace/gmail/api/reference/mcp/tools_list/create_draft), [thread search](https://developers.google.com/workspace/gmail/api/reference/mcp/tools_list/search_threads).
