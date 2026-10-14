import type { ConnectorManifest } from "@socius/contracts";
export function productivityConnector(
  id: string,
  name: string,
  url: string,
  setup: string,
  tools: NonNullable<ConnectorManifest["tools"]>,
): ConnectorManifest {
  return {
    schemaVersion: 1,
    id: `socius/${id}`,
    version: "0.1.0",
    kind: "connector",
    name,
    publisher: "Socius",
    license: "LicenseRef-Socius-Pending",
    description: `${name}: reviewed reads and exact-approval changes. Account setup is required.`,
    capabilities: [...new Set(tools.map((t) => t.capability))],
    dependencies: [],
    protocol: "mcp",
    transport: "streamable-http",
    authentication: "oauth",
    setup: `${setup} Endpoint: ${url}. Grant each bot access to this connector separately. Every write requires exact approval; ambiguous writes are not automatically replayed.`,
    tools,
  };
}
export const linearManifest = productivityConnector(
  "linear",
  "Linear",
  "https://mcp.linear.app/mcp",
  "Sign in to Linear using OAuth/PKCE.",
  [
    {
      id: "linear.search",
      access: "read",
      capability: "documents.read",
      description: "Search issues.",
    },
    {
      id: "linear.fetch",
      access: "read",
      capability: "documents.read",
      description: "Read an issue.",
    },
    {
      id: "linear.create-issue",
      access: "write",
      capability: "documents.write",
      description: "Create one issue after approval.",
    },
  ],
);

export const githubManifest = productivityConnector(
  "github",
  "GitHub",
  "https://api.githubcopilot.com/mcp/",
  "Host setup requires SOCIUS_GITHUB_CLIENT_ID and SOCIUS_GITHUB_CLIENT_SECRET for a dedicated OAuth app, with callback http://127.0.0.1:37377/oauth/callback. Organization approval may be required. Initial scope is repo (broad private repository access).",
  [
    {
      id: "github.search",
      access: "read",
      capability: "documents.read",
      description: "Search issues.",
    },
    {
      id: "github.fetch",
      access: "read",
      capability: "documents.read",
      description: "Read one issue.",
    },
    {
      id: "github.create-issue",
      access: "write",
      capability: "documents.write",
      description: "Create an issue after approval.",
    },
  ],
);

export const gmailManifest = productivityConnector(
  "gmail",
  "Gmail",
  "https://gmailmcp.googleapis.com/mcp/v1",
  "Requires Google Workspace MCP Developer Preview enrollment, enabled Gmail and Gmail MCP APIs, and a Web OAuth client marked as an AI agent. Configure SOCIUS_GMAIL_CLIENT_ID and SOCIUS_GMAIL_CLIENT_SECRET with callback http://127.0.0.1:37377/oauth/callback. First release creates drafts only; messages.send is the runtime permission for draft changes. No email sending.",
  [
    {
      id: "gmail.search",
      access: "read",
      capability: "messages.read",
      description: "Search threads.",
    },
    {
      id: "gmail.fetch-thread",
      access: "read",
      capability: "messages.read",
      description: "Read a thread.",
    },
    {
      id: "gmail.create-draft",
      access: "write",
      capability: "messages.send",
      description: "Create a plain-text draft after approval; never send.",
    },
  ],
);

export const calendarManifest = productivityConnector(
  "google-calendar",
  "Google Calendar",
  "https://calendarmcp.googleapis.com/mcp/v1",
  "Requires Google Workspace MCP Developer Preview, enabled Calendar and Calendar MCP APIs, and a Web OAuth AI-agent client. Configure SOCIUS_CALENDAR_CLIENT_ID and SOCIUS_CALENDAR_CLIENT_SECRET with callback http://127.0.0.1:37377/oauth/callback. Creates timed events only, with explicit offsets normalized to UTC; no attendees, invitations or recurrence.",
  [
    {
      id: "calendar.list-events",
      access: "read",
      capability: "calendar.read",
      description: "Read events in a time window.",
    },
    {
      id: "calendar.create-event",
      access: "write",
      capability: "calendar.write",
      description: "Create a timed event after approval.",
    },
  ],
);

export const slackManifest = productivityConnector(
  "slack",
  "Slack",
  "https://mcp.slack.com/mcp",
  "Requires an internal or Slack Marketplace published app (unlisted apps cannot use MCP). Configure SOCIUS_SLACK_CLIENT_ID and SOCIUS_SLACK_CLIENT_SECRET with callback http://127.0.0.1:37377/oauth/callback. Searches public channels and posts as the signed-in user after approval. No private search, DMs or scheduling. Workspace admin/IP policies apply.",
  [
    {
      id: "slack.search-public",
      access: "read",
      capability: "messages.read",
      description: "Search public-channel messages.",
    },
    {
      id: "slack.post-message",
      access: "write",
      capability: "messages.send",
      description: "Post to an existing channel after approval.",
    },
  ],
);

export const driveManifest = productivityConnector(
  "google-drive",
  "Google Drive",
  "https://drivemcp.googleapis.com/mcp/v1",
  "Requires Google Workspace MCP Developer Preview, enabled Drive and Drive MCP APIs, and a Web OAuth AI-agent client. Configure SOCIUS_DRIVE_CLIENT_ID and SOCIUS_DRIVE_CLIENT_SECRET with callback http://127.0.0.1:37377/oauth/callback. Read scope covers eligible accessible files; create uses drive.file. New documents inherit the approved folder's access. No share, overwrite or delete actions.",
  [
    {
      id: "drive.search",
      access: "read",
      capability: "documents.read",
      description: "Search eligible Drive files.",
    },
    {
      id: "drive.fetch",
      access: "read",
      capability: "documents.read",
      description: "Read an eligible file as text.",
    },
    {
      id: "drive.create-document",
      access: "write",
      capability: "documents.write",
      description: "Create a text document after folder/content approval.",
    },
  ],
);
